using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Xml.Serialization;
using System.Windows.Media;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;

namespace NinjaTrader.NinjaScript.Indicators
{
    public class ScalpRiskSizer : Indicator
    {
        private string entryTag;
        private string stopTag;
        private string targetTag;
        private string summaryTag;

        private HorizontalLine entryLine;
        private HorizontalLine stopLine;
        private HorizontalLine targetLine;
        private SimpleFont summaryFont;
        private bool linesInitialized;
        private Border riskControlBorder;
        private StackPanel riskControlPanel;
        private TextBlock riskValueText;
        private Border summaryControlBorder;
        private TextBlock summaryValueText;
        private Button riskMinusFiftyButton;
        private Button riskPlusFiftyButton;
        private Button riskPresetOneHundredButton;
        private Button riskPresetTwoHundredButton;
        private Button riskPresetTwoFiftyButton;
        private Button riskPresetFiveHundredButton;
        private Button snapModeButton;
        private bool riskControlAdded;
        private bool isDraggingRiskControl;
        private Point riskDragStartPoint;
        private Thickness riskControlStartMargin;
        private bool summaryControlAdded;
        private bool isDraggingSummaryControl;
        private Point summaryDragStartPoint;
        private Thickness summaryControlStartMargin;
        private bool snapModeBarAndPrice;
        private int lastPushedQuantity = -1;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = "Draggable entry, stop, and target lines that calculate contract size from a max dollar risk and show SL/TP distance in points, ticks, and dollars.";
                Name = "ScalpRiskSizer";
                Calculate = Calculate.OnPriceChange;
                IsOverlay = true;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                DrawHorizontalGridLines = true;
                DrawVerticalGridLines = true;
                PaintPriceMarkers = false;
                IsSuspendedWhileInactive = true;
                AddPlot(Brushes.Transparent, "Contracts");

                MaxRiskDollars = 100;
                DefaultStopTicks = 8;
                DefaultTargetTicks = 12;
                UseCurrentPriceAsEntry = true;
                ShowTargetLine = true;
                ContractsCap = 100;
                SummaryLocation = TextPosition.TopLeft;
                FontSize = 14;
            }
            else if (State == State.DataLoaded)
            {
                string instanceId = Guid.NewGuid().ToString("N");
                entryTag = instanceId + "_Entry";
                stopTag = instanceId + "_Stop";
                targetTag = instanceId + "_Target";
                summaryTag = instanceId + "_Summary";
                summaryFont = new SimpleFont("Consolas", FontSize);
            }
            else if (State == State.Terminated)
            {
                RemoveSummaryControl();
                RemoveRiskControls();
                RemoveDrawObject(entryTag);
                RemoveDrawObject(stopTag);
                RemoveDrawObject(targetTag);
                RemoveDrawObject(summaryTag);
                lastPushedQuantity = -1;
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 1)
                return;

            if (!linesInitialized && State != State.Realtime)
                return;

            EnsureRiskControls();
            EnsureSummaryControl();
            UpdateRiskControlDisplay();
            EnsureLines();
            UpdateFromCurrentState();
        }

        private void UpdateFromCurrentState()
        {
            double entryPrice = RoundToTick(UseCurrentPriceAsEntry ? Close[0] : GetLinePrice(entryLine, Close[0]));
            double stopPrice = RoundToTick(GetLinePrice(stopLine, entryPrice - (DefaultStopTicks * TickSize)));
            double targetPrice = RoundToTick(GetLinePrice(targetLine, entryPrice + (DefaultTargetTicks * TickSize)));

            TradeDirection direction = GetDirection(entryPrice, stopPrice);
            double riskDistance = Math.Abs(entryPrice - stopPrice);
            double riskTicks = riskDistance / TickSize;
            double riskPerContract = riskDistance * Instrument.MasterInstrument.PointValue;

            int suggestedContracts = 0;
            if (riskPerContract > 0)
                suggestedContracts = Math.Min(ContractsCap, (int)Math.Floor(MaxRiskDollars / riskPerContract));

            double totalRisk = suggestedContracts * riskPerContract;

            double targetDistance = ShowTargetLine ? Math.Abs(targetPrice - entryPrice) : 0;
            double targetTicks = TickSize > 0 ? targetDistance / TickSize : 0;
            double targetPerContract = targetDistance * Instrument.MasterInstrument.PointValue;
            double totalTarget = suggestedContracts * targetPerContract;
            double rewardRiskRatio = riskPerContract > 0 ? targetPerContract / riskPerContract : 0;
            bool targetMatchesDirection = IsTargetOnCorrectSide(direction, entryPrice, targetPrice);

            Values[0][0] = suggestedContracts;

            // Push the computed quantity into Chart Trader so Buy/Sell uses it automatically
            PushQuantityToChartTrader(suggestedContracts);

            string summaryText = BuildSummaryText(
                direction,
                entryPrice,
                stopPrice,
                targetPrice,
                riskDistance,
                riskTicks,
                riskPerContract,
                suggestedContracts,
                totalRisk,
                targetDistance,
                targetTicks,
                targetPerContract,
                totalTarget,
                rewardRiskRatio,
                targetMatchesDirection);

            UpdateSummaryControlDisplay(summaryText);
            RemoveDrawObject(summaryTag);
        }

        private void PushQuantityToChartTrader(int quantity)
        {
            if (quantity < 0)
                quantity = 0;

            // Only push if the quantity changed — avoids spamming the dispatcher
            if (quantity == lastPushedQuantity)
                return;

            lastPushedQuantity = quantity;

            if (ChartControl == null)
                return;

            try
            {
                ChartControl.Dispatcher.InvokeAsync(() =>
                {
                    if (ChartControl == null)
                        return;

                    Window window = Window.GetWindow(ChartControl.Parent);
                    if (window == null)
                        return;

                    NinjaTrader.Gui.Tools.QuantityUpDown quantitySelector =
                        window.FindFirst("ChartTraderControlQuantitySelector")
                        as NinjaTrader.Gui.Tools.QuantityUpDown;

                    if (quantitySelector != null)
                        quantitySelector.Value = quantity;
                });
            }
            catch { }
        }

        private void EnsureRiskControls()
        {
            if (riskControlAdded || ChartControl == null)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (riskControlAdded || ChartControl == null)
                    return;

                Panel parentPanel = ChartControl.Parent as Panel;
                if (parentPanel == null)
                    return;

                riskControlPanel = new StackPanel();
                riskControlPanel.Orientation = Orientation.Horizontal;
                riskControlPanel.Background = Brushes.Transparent;

                TextBlock riskLabel = new TextBlock();
                riskLabel.Text = "Risk $";
                riskLabel.Foreground = Brushes.WhiteSmoke;
                riskLabel.VerticalAlignment = VerticalAlignment.Center;
                riskLabel.Margin = new Thickness(0, 0, 6, 0);

                riskMinusFiftyButton = CreateRiskButton("-50", RiskMinusFiftyButton_Click, 40);
                riskPlusFiftyButton = CreateRiskButton("+50", RiskPlusFiftyButton_Click, 40);
                riskPresetOneHundredButton = CreateRiskButton("100", RiskPresetOneHundredButton_Click, 42);
                riskPresetTwoHundredButton = CreateRiskButton("200", RiskPresetTwoHundredButton_Click, 42);
                riskPresetTwoFiftyButton = CreateRiskButton("250", RiskPresetTwoFiftyButton_Click, 42);
                riskPresetFiveHundredButton = CreateRiskButton("500", RiskPresetFiveHundredButton_Click, 42);
                snapModeButton = CreateRiskButton("Snap", SnapModeButton_Click, 84);

                riskValueText = new TextBlock();
                riskValueText.Foreground = Brushes.WhiteSmoke;
                riskValueText.VerticalAlignment = VerticalAlignment.Center;
                riskValueText.Margin = new Thickness(6, 0, 6, 0);
                riskValueText.MinWidth = 54;
                riskValueText.TextAlignment = TextAlignment.Center;
                InitializeSnapModeState();
                UpdateRiskControlDisplay();
                UpdateSnapModeButtonDisplay();

                riskControlPanel.Children.Add(riskLabel);
                riskControlPanel.Children.Add(riskMinusFiftyButton);
                riskControlPanel.Children.Add(riskValueText);
                riskControlPanel.Children.Add(riskPlusFiftyButton);
                riskControlPanel.Children.Add(riskPresetOneHundredButton);
                riskControlPanel.Children.Add(riskPresetTwoHundredButton);
                riskControlPanel.Children.Add(riskPresetTwoFiftyButton);
                riskControlPanel.Children.Add(riskPresetFiveHundredButton);
                riskControlPanel.Children.Add(snapModeButton);

                riskControlBorder = new Border();
                riskControlBorder.Background = new SolidColorBrush(Color.FromArgb(180, 20, 20, 20));
                riskControlBorder.BorderBrush = Brushes.DimGray;
                riskControlBorder.BorderThickness = new Thickness(1);
                riskControlBorder.CornerRadius = new CornerRadius(3);
                riskControlBorder.Padding = new Thickness(6, 4, 6, 4);
                riskControlBorder.HorizontalAlignment = HorizontalAlignment.Right;
                riskControlBorder.VerticalAlignment = VerticalAlignment.Top;
                riskControlBorder.Margin = new Thickness(0, 8, 110, 0);
                riskControlBorder.Child = riskControlPanel;
                riskControlBorder.MouseLeftButtonDown += RiskControlBorder_MouseLeftButtonDown;
                riskControlBorder.MouseMove += RiskControlBorder_MouseMove;
                riskControlBorder.MouseLeftButtonUp += RiskControlBorder_MouseLeftButtonUp;

                parentPanel.Children.Add(riskControlBorder);
                System.Windows.Controls.Panel.SetZIndex(riskControlBorder, int.MaxValue);
                riskControlAdded = true;
            });
        }

        private void EnsureSummaryControl()
        {
            if (summaryControlAdded || ChartControl == null)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (summaryControlAdded || ChartControl == null)
                    return;

                Panel parentPanel = ChartControl.Parent as Panel;
                if (parentPanel == null)
                    return;

                summaryValueText = new TextBlock();
                summaryValueText.Foreground = Brushes.WhiteSmoke;
                summaryValueText.FontFamily = new FontFamily("Consolas");
                summaryValueText.FontSize = FontSize;
                summaryValueText.TextWrapping = TextWrapping.NoWrap;

                summaryControlBorder = new Border();
                summaryControlBorder.Background = new SolidColorBrush(Color.FromArgb(180, 20, 20, 20));
                summaryControlBorder.BorderBrush = Brushes.DimGray;
                summaryControlBorder.BorderThickness = new Thickness(1);
                summaryControlBorder.CornerRadius = new CornerRadius(3);
                summaryControlBorder.Padding = new Thickness(8, 6, 8, 6);
                summaryControlBorder.HorizontalAlignment = HorizontalAlignment.Left;
                summaryControlBorder.VerticalAlignment = VerticalAlignment.Top;
                summaryControlBorder.Margin = new Thickness(12, 8, 0, 0);
                summaryControlBorder.Child = summaryValueText;
                summaryControlBorder.MouseLeftButtonDown += SummaryControlBorder_MouseLeftButtonDown;
                summaryControlBorder.MouseMove += SummaryControlBorder_MouseMove;
                summaryControlBorder.MouseLeftButtonUp += SummaryControlBorder_MouseLeftButtonUp;

                parentPanel.Children.Add(summaryControlBorder);
                System.Windows.Controls.Panel.SetZIndex(summaryControlBorder, int.MaxValue);
                summaryControlAdded = true;
                RemoveDrawObject(summaryTag);
            });
        }

        private Button CreateRiskButton(string text, RoutedEventHandler clickHandler, double width)
        {
            Button button = new Button();
            button.Content = text;
            button.Width = width;
            button.Height = 22;
            button.Margin = new Thickness(2, 0, 2, 0);
            button.Padding = new Thickness(2, 0, 2, 0);
            button.Click += clickHandler;
            return button;
        }

        private void RiskMinusFiftyButton_Click(object sender, RoutedEventArgs e)
        {
            ChangeRiskBy(-50);
        }

        private void RiskPlusFiftyButton_Click(object sender, RoutedEventArgs e)
        {
            ChangeRiskBy(50);
        }

        private void RiskPresetOneHundredButton_Click(object sender, RoutedEventArgs e)
        {
            SetRiskAmount(100);
        }

        private void RiskPresetTwoHundredButton_Click(object sender, RoutedEventArgs e)
        {
            SetRiskAmount(200);
        }

        private void RiskPresetTwoFiftyButton_Click(object sender, RoutedEventArgs e)
        {
            SetRiskAmount(250);
        }

        private void RiskPresetFiveHundredButton_Click(object sender, RoutedEventArgs e)
        {
            SetRiskAmount(500);
        }

        private void SnapModeButton_Click(object sender, RoutedEventArgs e)
        {
            ToggleSnapMode();
        }

        private void ChangeRiskBy(double delta)
        {
            TriggerCustomEvent(o =>
            {
                MaxRiskDollars = Math.Max(1, MaxRiskDollars + delta);
                UpdateRiskControlDisplay();
                if (CurrentBar >= 1)
                    UpdateFromCurrentState();
            }, null);
        }

        private void SetRiskAmount(double riskAmount)
        {
            TriggerCustomEvent(o =>
            {
                MaxRiskDollars = Math.Max(1, riskAmount);
                UpdateRiskControlDisplay();
                if (CurrentBar >= 1)
                    UpdateFromCurrentState();
            }, null);
        }

        private void InitializeSnapModeState()
        {
            if (ChartControl == null || ChartControl.Properties == null)
                return;

            snapModeBarAndPrice = ChartControl.Properties.SnapMode == SnapMode.BarAndPrice;
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
                UpdateSnapModeButtonDisplay();
            });
        }

        private void RiskControlBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (riskControlBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            isDraggingRiskControl = true;
            riskDragStartPoint = e.GetPosition(parentPanel);
            riskControlStartMargin = riskControlBorder.Margin;
            riskControlBorder.CaptureMouse();
            e.Handled = true;
        }

        private void RiskControlBorder_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDraggingRiskControl || riskControlBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            Point currentPoint = e.GetPosition(parentPanel);
            double deltaX = currentPoint.X - riskDragStartPoint.X;
            double deltaY = currentPoint.Y - riskDragStartPoint.Y;

            double newTop = Math.Max(0, riskControlStartMargin.Top + deltaY);
            double newRight = Math.Max(0, riskControlStartMargin.Right - deltaX);
            riskControlBorder.Margin = new Thickness(0, newTop, newRight, 0);
        }

        private void RiskControlBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            StopRiskControlDrag();
            e.Handled = true;
        }

        private void StopRiskControlDrag()
        {
            isDraggingRiskControl = false;

            if (riskControlBorder != null && riskControlBorder.IsMouseCaptured)
                riskControlBorder.ReleaseMouseCapture();
        }

        private void SummaryControlBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
        {
            if (summaryControlBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            isDraggingSummaryControl = true;
            summaryDragStartPoint = e.GetPosition(parentPanel);
            summaryControlStartMargin = summaryControlBorder.Margin;
            summaryControlBorder.CaptureMouse();
            e.Handled = true;
        }

        private void SummaryControlBorder_MouseMove(object sender, MouseEventArgs e)
        {
            if (!isDraggingSummaryControl || summaryControlBorder == null)
                return;

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel == null)
                return;

            Point currentPoint = e.GetPosition(parentPanel);
            double deltaX = currentPoint.X - summaryDragStartPoint.X;
            double deltaY = currentPoint.Y - summaryDragStartPoint.Y;

            double newLeft = Math.Max(0, summaryControlStartMargin.Left + deltaX);
            double newTop = Math.Max(0, summaryControlStartMargin.Top + deltaY);
            summaryControlBorder.Margin = new Thickness(newLeft, newTop, 0, 0);
        }

        private void SummaryControlBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
        {
            StopSummaryControlDrag();
            e.Handled = true;
        }

        private void StopSummaryControlDrag()
        {
            isDraggingSummaryControl = false;

            if (summaryControlBorder != null && summaryControlBorder.IsMouseCaptured)
                summaryControlBorder.ReleaseMouseCapture();
        }

        private void UpdateRiskControlDisplay()
        {
            if (riskValueText == null || !riskControlAdded)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (riskValueText != null)
                    riskValueText.Text = MaxRiskDollars.ToString("0.##", CultureInfo.InvariantCulture);
            });
        }

        private void UpdateSummaryControlDisplay(string summaryText)
        {
            if (summaryValueText == null || !summaryControlAdded)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (summaryValueText != null)
                    summaryValueText.Text = summaryText;
            });
        }

        private void UpdateSnapModeButtonDisplay()
        {
            if (snapModeButton == null)
                return;

            ChartControl.Dispatcher.InvokeAsync(() =>
            {
                if (snapModeButton == null)
                    return;

                snapModeButton.Content = snapModeBarAndPrice ? "Snap: B&P" : "Snap: Bar";
            });
        }

        private void RemoveRiskControls()
        {
            if (riskControlBorder == null && ChartControl == null)
                return;

            if (riskControlBorder != null)
            {
                riskControlBorder.Dispatcher.InvokeAsync(() =>
                {
                    DetachAndRemoveRiskControls();
                });
            }
            else
            {
                ChartControl.Dispatcher.InvokeAsync(() =>
                {
                    DetachAndRemoveRiskControls();
                });
            }
        }

        private void RemoveSummaryControl()
        {
            if (summaryControlBorder == null && ChartControl == null)
                return;

            if (summaryControlBorder != null)
            {
                summaryControlBorder.Dispatcher.InvokeAsync(() =>
                {
                    DetachAndRemoveSummaryControl();
                });
            }
            else
            {
                ChartControl.Dispatcher.InvokeAsync(() =>
                {
                    DetachAndRemoveSummaryControl();
                });
            }
        }

        private void DetachAndRemoveRiskControls()
        {
            StopRiskControlDrag();

            if (riskMinusFiftyButton != null)
                riskMinusFiftyButton.Click -= RiskMinusFiftyButton_Click;
            if (riskPlusFiftyButton != null)
                riskPlusFiftyButton.Click -= RiskPlusFiftyButton_Click;
            if (riskPresetOneHundredButton != null)
                riskPresetOneHundredButton.Click -= RiskPresetOneHundredButton_Click;
            if (riskPresetTwoHundredButton != null)
                riskPresetTwoHundredButton.Click -= RiskPresetTwoHundredButton_Click;
            if (riskPresetTwoFiftyButton != null)
                riskPresetTwoFiftyButton.Click -= RiskPresetTwoFiftyButton_Click;
            if (riskPresetFiveHundredButton != null)
                riskPresetFiveHundredButton.Click -= RiskPresetFiveHundredButton_Click;
            if (snapModeButton != null)
                snapModeButton.Click -= SnapModeButton_Click;
            if (riskControlBorder != null)
            {
                riskControlBorder.MouseLeftButtonDown -= RiskControlBorder_MouseLeftButtonDown;
                riskControlBorder.MouseMove -= RiskControlBorder_MouseMove;
                riskControlBorder.MouseLeftButtonUp -= RiskControlBorder_MouseLeftButtonUp;
            }

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel != null && riskControlBorder != null)
                parentPanel.Children.Remove(riskControlBorder);

            riskMinusFiftyButton = null;
            riskPlusFiftyButton = null;
            riskPresetOneHundredButton = null;
            riskPresetTwoHundredButton = null;
            riskPresetTwoFiftyButton = null;
            riskPresetFiveHundredButton = null;
            snapModeButton = null;
            riskValueText = null;
            riskControlPanel = null;
            riskControlBorder = null;
            riskControlAdded = false;
        }

        private void DetachAndRemoveSummaryControl()
        {
            StopSummaryControlDrag();

            if (summaryControlBorder != null)
            {
                summaryControlBorder.MouseLeftButtonDown -= SummaryControlBorder_MouseLeftButtonDown;
                summaryControlBorder.MouseMove -= SummaryControlBorder_MouseMove;
                summaryControlBorder.MouseLeftButtonUp -= SummaryControlBorder_MouseLeftButtonUp;
            }

            Panel parentPanel = ChartControl == null ? null : ChartControl.Parent as Panel;
            if (parentPanel != null && summaryControlBorder != null)
                parentPanel.Children.Remove(summaryControlBorder);

            summaryValueText = null;
            summaryControlBorder = null;
            summaryControlAdded = false;
        }

        private void EnsureLines()
        {
            entryLine = FindHorizontalLine(entryTag);
            stopLine = FindHorizontalLine(stopTag);
            targetLine = FindHorizontalLine(targetTag);

            if (!linesInitialized)
            {
                double basePrice = RoundToTick(Close[0]);

                if (!UseCurrentPriceAsEntry && entryLine == null)
                    entryLine = Draw.HorizontalLine(this, entryTag, false, basePrice, Brushes.DeepSkyBlue, DashStyleHelper.Solid, 2);

                if (stopLine == null)
                    stopLine = Draw.HorizontalLine(this, stopTag, false, basePrice - (DefaultStopTicks * TickSize), Brushes.OrangeRed, DashStyleHelper.Solid, 2);

                if (ShowTargetLine && targetLine == null)
                    targetLine = Draw.HorizontalLine(this, targetTag, false, basePrice + (DefaultTargetTicks * TickSize), Brushes.LimeGreen, DashStyleHelper.Dash, 2);

                UnlockLine(entryLine);
                UnlockLine(stopLine);
                UnlockLine(targetLine);
                linesInitialized = true;
            }
            else
            {
                if (UseCurrentPriceAsEntry)
                {
                    if (entryLine != null)
                    {
                        RemoveDrawObject(entryTag);
                        entryLine = null;
                    }
                }
                else if (entryLine == null)
                    entryLine = Draw.HorizontalLine(this, entryTag, false, RoundToTick(Close[0]), Brushes.DeepSkyBlue, DashStyleHelper.Solid, 2);

                if (stopLine == null)
                    stopLine = Draw.HorizontalLine(this, stopTag, false, RoundToTick(Close[0] - (DefaultStopTicks * TickSize)), Brushes.OrangeRed, DashStyleHelper.Solid, 2);

                if (ShowTargetLine)
                {
                    if (targetLine == null)
                        targetLine = Draw.HorizontalLine(this, targetTag, false, RoundToTick(Close[0] + (DefaultTargetTicks * TickSize)), Brushes.LimeGreen, DashStyleHelper.Dash, 2);
                }
                else if (targetLine != null)
                {
                    RemoveDrawObject(targetTag);
                    targetLine = null;
                }

                UnlockLine(entryLine);
                UnlockLine(stopLine);
                UnlockLine(targetLine);
            }
        }

        private void UnlockLine(HorizontalLine line)
        {
            if (line == null)
                return;

            line.IsLocked = false;
        }

        private HorizontalLine FindHorizontalLine(string tag)
        {
            if (string.IsNullOrEmpty(tag))
                return null;

            foreach (DrawingTool drawObject in DrawObjects)
            {
                if (drawObject != null && drawObject.Tag == tag)
                    return drawObject as HorizontalLine;
            }

            return null;
        }

        private double GetLinePrice(HorizontalLine line, double fallbackPrice)
        {
            if (line == null || line.StartAnchor == null)
                return fallbackPrice;

            return line.StartAnchor.Price;
        }

        private TradeDirection GetDirection(double entryPrice, double stopPrice)
        {
            if (stopPrice < entryPrice)
                return TradeDirection.Long;

            if (stopPrice > entryPrice)
                return TradeDirection.Short;

            return TradeDirection.Flat;
        }

        private bool IsTargetOnCorrectSide(TradeDirection direction, double entryPrice, double targetPrice)
        {
            if (!ShowTargetLine)
                return true;

            if (direction == TradeDirection.Long)
                return targetPrice > entryPrice;

            if (direction == TradeDirection.Short)
                return targetPrice < entryPrice;

            return false;
        }

        private double RoundToTick(double price)
        {
            if (TickSize <= 0)
                return price;

            return Math.Round(price / TickSize, MidpointRounding.AwayFromZero) * TickSize;
        }

        private string FormatPrice(double price)
        {
            return Instrument != null && Instrument.MasterInstrument != null
                ? Instrument.MasterInstrument.FormatPrice(price)
                : price.ToString("0.00####", CultureInfo.InvariantCulture);
        }

        private string FormatDollars(double value)
        {
            return value.ToString("C2", CultureInfo.InvariantCulture);
        }

        private string FormatNumber(double value)
        {
            return value.ToString("0.##", CultureInfo.InvariantCulture);
        }

        private string BuildSummaryText(
            TradeDirection direction,
            double entryPrice,
            double stopPrice,
            double targetPrice,
            double riskDistance,
            double riskTicks,
            double riskPerContract,
            int suggestedContracts,
            double totalRisk,
            double targetDistance,
            double targetTicks,
            double targetPerContract,
            double totalTarget,
            double rewardRiskRatio,
            bool targetMatchesDirection)
        {
            StringBuilder summary = new StringBuilder();

            if (riskDistance <= 0)
            {
                summary.AppendLine("Qty    : 0");
                summary.AppendLine("SL     : Move the stop line.");
                if (ShowTargetLine)
                    summary.AppendLine("TP     : Drag the target line.");
                summary.AppendLine("R:R    : 0 : 1");
                return summary.ToString();
            }

            summary.AppendLine("Qty    : " + suggestedContracts);
            summary.AppendLine("SL     : " + FormatNumber(riskDistance) + " pts | " + FormatNumber(riskTicks) + " ticks | " + FormatDollars(riskPerContract) + "/ctr | " + FormatDollars(totalRisk) + " total");

            if (ShowTargetLine)
            {
                summary.AppendLine("TP     : " + FormatNumber(targetDistance) + " pts | " + FormatNumber(targetTicks) + " ticks | " + FormatDollars(targetPerContract) + "/ctr | " + FormatDollars(totalTarget) + " total");
                summary.AppendLine("R:R    : " + FormatNumber(rewardRiskRatio) + " : 1" + (targetMatchesDirection ? string.Empty : "  (target is on the wrong side)"));
            }
            else
                summary.AppendLine("R:R    : 0 : 1");

            if (suggestedContracts == 0)
                summary.AppendLine("Note   : Risk per contract is larger than your max risk.");

            return summary.ToString();
        }

        [Browsable(false)]
        [XmlIgnore]
        public Series<double> Contracts
        {
            get { return Values[0]; }
        }

        [NinjaScriptProperty]
        [Range(1, double.MaxValue)]
        [Display(Name = "MaxRiskDollars", Description = "Maximum amount you want to lose on the trade.", Order = 1, GroupName = "Parameters")]
        public double MaxRiskDollars
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "DefaultStopTicks", Description = "Starting stop distance used when the lines are first created.", Order = 2, GroupName = "Parameters")]
        public int DefaultStopTicks
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "DefaultTargetTicks", Description = "Starting target distance used when the lines are first created.", Order = 3, GroupName = "Parameters")]
        public int DefaultTargetTicks
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Display(Name = "ShowTargetLine", Description = "Show a draggable target line and reward calculations.", Order = 4, GroupName = "Parameters")]
        public bool ShowTargetLine
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Display(Name = "UseCurrentPriceAsEntry", Description = "Use the current market price instead of a draggable entry line.", Order = 5, GroupName = "Parameters")]
        public bool UseCurrentPriceAsEntry
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Range(1, int.MaxValue)]
        [Display(Name = "ContractsCap", Description = "Optional safety cap for the suggested contract quantity.", Order = 6, GroupName = "Parameters")]
        public int ContractsCap
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Display(Name = "SummaryLocation", Description = "Chart corner used for the readout.", Order = 7, GroupName = "Display")]
        public TextPosition SummaryLocation
        {
            get;
            set;
        }

        [NinjaScriptProperty]
        [Range(8, 40)]
        [Display(Name = "FontSize", Description = "Font size used for the readout.", Order = 8, GroupName = "Display")]
        public int FontSize
        {
            get;
            set;
        }

        private enum TradeDirection
        {
            Flat,
            Long,
            Short
        }
    }
}
