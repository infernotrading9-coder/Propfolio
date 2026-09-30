using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;

namespace NinjaTrader.NinjaScript.Indicators
{
    /// <summary>
    /// SnapModeToggle — floating magnet button + hotkey that toggles NT8 snap mode
    /// between Bar+Price and Bar only. Draggable. Default hotkey: M.
    /// </summary>
    public class SnapModeToggle : Indicator
    {
        #region Inputs

        [NinjaScriptProperty]
        [Display(Name = "Hotkey", Description = "Keyboard key that toggles snap mode. Single letter (case insensitive).", Order = 1, GroupName = "Settings")]
        public string Hotkey { get; set; }

        #endregion

        #region State

        private Border snapBorder;
        private Button snapButton;
        private bool controlAdded;
        private bool isDragging;
        private Point dragStartPoint;
        private Thickness dragStartMargin;
        private bool snapModeBarAndPrice;
        private bool keyHandlerAttached;
        private Key configuredKey = Key.M;

        #endregion

        #region Lifecycle

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Floating magnet button + hotkey that toggles NT8 snap mode (Bar+Price / Bar).";
                Name = "SnapModeToggle";
                Calculate = Calculate.OnPriceChange;
                IsOverlay = true;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                IsSuspendedWhileInactive = true;

                Hotkey = "M";
            }
            else if (State == State.DataLoaded)
            {
                // Parse the hotkey string into a Key enum
                configuredKey = Key.M;
                if (!string.IsNullOrEmpty(Hotkey))
                {
                    try
                    {
                        configuredKey = (Key)Enum.Parse(typeof(Key), Hotkey, true);
                    }
                    catch { configuredKey = Key.M; }
                }
            }
            else if (State == State.Historical)
            {
                EnsureControl();
            }
            else if (State == State.Terminated)
            {
                RemoveKeyHandler();
                RemoveControl();
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 1)
                return;

            EnsureControl();
            EnsureKeyHandler();
        }

        #endregion

        #region Button

        private void EnsureControl()
        {
            if (controlAdded || ChartControl == null)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (controlAdded || ChartControl == null)
                    return;

                Panel parentPanel = ChartControl.Parent as Panel;
                if (parentPanel == null)
                    return;

                snapButton = new Button
                {
                    Content = "\U0001F9F2",
                    FontSize = 18,
                    Width = 40,
                    Height = 32,
                    Padding = new Thickness(0),
                    Margin = new Thickness(0),
                    Cursor = Cursors.Hand,
                    ToolTip = "Toggle snap mode (Bar+Price / Bar)"
                };

                snapButton.Effect = new DropShadowEffect
                {
                    Color = Colors.DodgerBlue,
                    ShadowDepth = 0,
                    BlurRadius = 12,
                    Opacity = 0.85
                };

                snapButton.Click += SnapButton_Click;

                snapBorder = new Border
                {
                    Background = new SolidColorBrush(Color.FromArgb(200, 20, 22, 28)),
                    BorderBrush = new SolidColorBrush(Color.FromArgb(255, 60, 130, 226)),
                    BorderThickness = new Thickness(1.5),
                    CornerRadius = new CornerRadius(6),
                    Padding = new Thickness(2),
                    Margin = new Thickness(12, 34, 0, 0),
                    HorizontalAlignment = HorizontalAlignment.Left,
                    VerticalAlignment = VerticalAlignment.Top,
                    Child = snapButton,
                    Effect = new DropShadowEffect
                    {
                        Color = Colors.DodgerBlue,
                        ShadowDepth = 0,
                        BlurRadius = 16,
                        Opacity = 0.6
                    }
                };

                snapBorder.MouseLeftButtonDown += SnapBorder_MouseLeftButtonDown;
                snapBorder.MouseMove += SnapBorder_MouseMove;
                snapBorder.MouseLeftButtonUp += SnapBorder_MouseLeftButtonUp;

                InitializeSnapModeState();
                UpdateButtonDisplay();

                parentPanel.Children.Add(snapBorder);
                System.Windows.Controls.Panel.SetZIndex(snapBorder, int.MaxValue);
                controlAdded = true;
            });
        }

        private void RemoveControl()
        {
            if (snapButton != null)
                snapButton.Click -= SnapButton_Click;

            if (snapBorder != null)
            {
                snapBorder.MouseLeftButtonDown -= SnapBorder_MouseLeftButtonDown;
                snapBorder.MouseMove -= SnapBorder_MouseMove;
                snapBorder.MouseLeftButtonUp -= SnapBorder_MouseLeftButtonUp;

                try
                {
                    Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
                    if (parentPanel != null)
                        parentPanel.Children.Remove(snapBorder);
                }
                catch { }
            }

            snapBorder = null;
            snapButton = null;
            controlAdded = false;
        }

        #endregion

        #region Hotkey

        private void EnsureKeyHandler()
        {
            if (keyHandlerAttached || ChartControl == null)
                return;

            try
            {
                ChartControl.AddHandler(Keyboard.KeyDownEvent, new KeyEventHandler(OnChartKeyDown), true);
                keyHandlerAttached = true;
            }
            catch { }
        }

        private void RemoveKeyHandler()
        {
            if (!keyHandlerAttached || ChartControl == null)
                return;

            try { ChartControl.RemoveHandler(Keyboard.KeyDownEvent, new KeyEventHandler(OnChartKeyDown)); }
            catch { }
            keyHandlerAttached = false;
        }

        private void OnChartKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == configuredKey)
            {
                ToggleSnapMode();
                e.Handled = true;
            }
        }

        #endregion

        #region Snap toggle

        private void SnapButton_Click(object sender, RoutedEventArgs e)
        {
            ToggleSnapMode();
        }

        private void ToggleSnapMode()
        {
            if (ChartControl == null || ChartControl.Properties == null)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (ChartControl == null || ChartControl.Properties == null)
                    return;

                snapModeBarAndPrice = !snapModeBarAndPrice;
                ChartControl.Properties.SnapMode = snapModeBarAndPrice ? SnapMode.BarAndPrice : SnapMode.Bar;
                UpdateButtonDisplay();
            });
        }

        private void InitializeSnapModeState()
        {
            if (ChartControl == null || ChartControl.Properties == null)
                return;

            snapModeBarAndPrice = ChartControl.Properties.SnapMode == SnapMode.BarAndPrice;
        }

        private void UpdateButtonDisplay()
        {
            if (snapBorder == null)
                return;

            snapBorder.BorderBrush = snapModeBarAndPrice
                ? new SolidColorBrush(Color.FromArgb(255, 60, 200, 120))
                : new SolidColorBrush(Color.FromArgb(255, 100, 110, 130));

            snapBorder.Effect = new DropShadowEffect
            {
                Color = snapModeBarAndPrice ? Colors.LimeGreen : Colors.DodgerBlue,
                ShadowDepth = 0,
                BlurRadius = snapModeBarAndPrice ? 18 : 10,
                Opacity = snapModeBarAndPrice ? 0.8 : 0.5
            };

            if (snapButton != null)
                snapButton.ToolTip = snapModeBarAndPrice
                    ? "Snap: Bar+Price  (click or press " + configuredKey + " to toggle)"
                    : "Snap: Bar only  (click or press " + configuredKey + " to toggle)";
        }

        #endregion

        #region Dragging

        private void SnapBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (snapBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            isDragging = true;
            dragStartPoint = e.GetPosition(parentPanel);
            dragStartMargin = snapBorder.Margin;
            snapBorder.CaptureMouse();
            e.Handled = true;
        }

        private void SnapBorder_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDragging || snapBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            Point current = e.GetPosition(parentPanel);
            double left = Math.Max(0, dragStartMargin.Left + current.X - dragStartPoint.X);
            double top = Math.Max(0, dragStartMargin.Top + current.Y - dragStartPoint.Y);
            snapBorder.Margin = new Thickness(left, top, 0, 0);
            e.Handled = true;
        }

        private void SnapBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            isDragging = false;
            if (snapBorder != null && snapBorder.IsMouseCaptured)
                snapBorder.ReleaseMouseCapture();
            e.Handled = true;
        }

        #endregion
    }
}
