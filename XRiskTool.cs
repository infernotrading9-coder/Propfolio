#region Using declarations
using System;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.Gui.Tools;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public enum XRiskMode
    {
        Survival,
        Defensive,
        Cautious,
        Balanced,
        Confident,
        Aggressive,
        Eval
    }

    /// <summary>
    /// XRiskTool — TradingView-style risk/reward tool for NinjaTrader 8.
    /// Draggable PLACE button → click → click chart to drop entry → bounded box with lines.
    /// Drag box corner to resize. Drag lines to adjust entry/stop. Targets auto-follow.
    /// </summary>
    public class XRiskTool : Indicator
    {
        #region Inputs

        [NinjaScriptProperty]
        [Display(Name = "Mode", Description = "Risk mode. Eval = fixed Risk $.", Order = 1, GroupName = "Risk")]
        public XRiskMode Mode { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Risk $ (Eval)", Description = "Fixed risk when Mode = Eval.", Order = 2, GroupName = "Risk")]
        public double EvalRiskDollars { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "Default Stop (ticks)", Description = "Initial stop distance in ticks.", Order = 3, GroupName = "Risk")]
        public int DefaultStopTicks { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "TP1 (R)", Order = 1, GroupName = "Targets")]
        public double Tp1R { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "TP2 (R)", Order = 2, GroupName = "Targets")]
        public double Tp2R { get; set; }

        [NinjaScriptProperty]
        [Display(Name = "TP3 (R)", Order = 3, GroupName = "Targets")]
        public double Tp3R { get; set; }

        #endregion

        #region State

        private string tagEntry, tagStop, tagTP1, tagTP2, tagTP3, tagReadout, tagButton;
        private HorizontalLine entryLine, stopLine, tp1Line, tp2Line, tp3Line;
        private bool bundleActive;
        private bool armed;
        private bool mouseAttached;

        // Button position (draggable)
        private double btnX = 12, btnY = 6;
        private bool draggingBtn;
        private Point btnDragStart;

        // Box geometry (bounded — not full screen)
        private double boxLeftFrac = 0.15;   // left edge as fraction of panel width
        private double boxRightFrac = 0.85;  // right edge as fraction of panel width
        private bool resizingBox;
        private Point resizeStart;
        private double resizeStartLeft, resizeStartRight;

        // Dragging lines
        private int draggingLine; // 0=none, 1=entry, 2=stop
        private double dragStartPrice;

        #endregion

        #region Lifecycle

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Description = @"XRisk — TradingView-style risk/reward tool.";
                Name = "XRiskTool";
                IsOverlay = true;
                Calculate = Calculate.OnEachTick;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                IsSuspendedWhileInactive = false;

                Mode = XRiskMode.Survival;
                EvalRiskDollars = 50;
                DefaultStopTicks = 5;
                Tp1R = 1.0;
                Tp2R = 2.0;
                Tp3R = 3.0;
            }
            else if (State == State.DataLoaded)
            {
                string id = Guid.NewGuid().ToString("N");
                tagEntry   = id + "_E";
                tagStop    = id + "_S";
                tagTP1     = id + "_T1";
                tagTP2     = id + "_T2";
                tagTP3     = id + "_T3";
                tagReadout = id + "_RO";
                tagButton  = id + "_BTN";
            }
            else if (State == State.Terminated)
            {
                RemoveMouseHandler();
                RemoveBundleDrawings();
                RemoveDrawObject(tagButton);
            }
        }

        protected override void OnBarUpdate()
        {
            if (CurrentBar < 1 || Instrument == null || Instrument.MasterInstrument == null || TickSize <= 0)
                return;

            EnsureMouseHandler();
            DrawButton();
            RefreshBundle();
        }

        #endregion

        #region Button (TextFixed top-left — always works)

        private void DrawButton()
        {
            if (string.IsNullOrEmpty(tagButton))
                return;

            string label = armed ? "XRisk  (click chart to drop)" : (bundleActive ? "XRisk  [ CLEAR ]" : "XRisk  [ PLACE ]");
            Brush textBrush = armed ? Brushes.Gold : (bundleActive ? Brushes.OrangeRed : Brushes.White);

            Draw.TextFixed(
                this, tagButton, label,
                TextPosition.TopLeft,
                textBrush,
                new SimpleFont("Arial", 14),
                new SolidColorBrush(Color.FromArgb(220, 12, 15, 22)),
                new SolidColorBrush(Color.FromArgb(180, 30, 35, 45)),
                90);
        }

        #endregion

        #region Mouse handling

        private void EnsureMouseHandler()
        {
            if (mouseAttached || ChartControl == null)
                return;
            try
            {
                ChartControl.AddHandler(Mouse.MouseDownEvent, new MouseButtonEventHandler(OnMouseDown), true);
                ChartControl.AddHandler(Mouse.MouseMoveEvent, new MouseEventHandler(OnMouseMove), true);
                ChartControl.AddHandler(Mouse.MouseUpEvent, new MouseButtonEventHandler(OnMouseUp), true);
                mouseAttached = true;
            }
            catch { }
        }

        private void RemoveMouseHandler()
        {
            if (!mouseAttached || ChartControl == null)
                return;
            try
            {
                ChartControl.RemoveHandler(Mouse.MouseDownEvent, new MouseButtonEventHandler(OnMouseDown));
                ChartControl.RemoveHandler(Mouse.MouseMoveEvent, new MouseEventHandler(OnMouseMove));
                ChartControl.RemoveHandler(Mouse.MouseUpEvent, new MouseButtonEventHandler(OnMouseUp));
            }
            catch { }
            mouseAttached = false;
        }

        private void OnMouseDown(object sender, MouseButtonEventArgs e)
        {
            if (ChartControl == null || e.ChangedButton != MouseButton.Left)
                return;

            Point p;
            try { p = e.GetPosition(ChartControl); }
            catch { return; }

            // ── If armed → drop bundle at mouse price ──
            if (armed)
            {
                double price = MouseToPrice(p);
                if (!double.IsNaN(price) && TickSize > 0)
                {
                    DropBundle(price);
                    armed = false;
                }
                e.Handled = true;
                return;
            }

            if (ChartPanel == null) return;

            float pX = (float)ChartPanel.X;
            float pY = (float)ChartPanel.Y;
            float pW = (float)ChartPanel.W;
            float pH = (float)ChartPanel.H;

            // ── Button area (top-left, TextFixed) ──
            if (p.Y >= pY + 2 && p.Y <= pY + 30 && p.X >= pX + 40 && p.X <= pX + 250)
            {
                if (bundleActive)
                    ClearBundle();
                else
                    armed = true;
                e.Handled = true;
                return;
            }

            if (!bundleActive) return;

            // ── Resize handle (bottom-right corner of box) ──
            float boxL = pX + (float)(boxLeftFrac * pW);
            float boxR = pX + (float)(boxRightFrac * pW);

            double entry = GetPrice(entryLine);
            double stop = GetPrice(stopLine);
            if (double.IsNaN(entry) || double.IsNaN(stop)) return;

            ChartScale scale = GetPriceScale();
            if (scale == null) return;

            float yEntry = scale.GetYByValue(entry);
            float yStop = scale.GetYByValue(stop);
            float boxTop = Math.Min(yEntry, yStop) - 20;
            float boxBottom = Math.Max(yEntry, yStop) + 20;

            // Resize handle at bottom-right corner
            float handleSize = 16;
            if (Math.Abs(p.X - (boxR - 2)) < handleSize && Math.Abs(p.Y - (boxBottom - 2)) < handleSize)
            {
                resizingBox = true;
                resizeStart = p;
                resizeStartLeft = boxLeftFrac;
                resizeStartRight = boxRightFrac;
                e.Handled = true;
                return;
            }

            // ── Line dragging (generous grab zones) ──
            float grabRadius = 8;
            if (Math.Abs(p.Y - yEntry) < grabRadius && p.X >= boxL - 10 && p.X <= boxR + 10)
            {
                draggingLine = 1;
                dragStartPrice = entry;
                e.Handled = true;
                return;
            }
            if (Math.Abs(p.Y - yStop) < grabRadius && p.X >= boxL - 10 && p.X <= boxR + 10)
            {
                draggingLine = 2;
                dragStartPrice = stop;
                e.Handled = true;
                return;
            }
        }

        private void OnMouseMove(object sender, MouseEventArgs e)
        {
            if (ChartControl == null) return;
            Point p;
            try { p = e.GetPosition(ChartControl); }
            catch { return; }

            if (armed)
            {
                ForceRefresh();
                e.Handled = true;
                return;
            }

            if (draggingLine != 0)
            {
                double newPrice = MouseToPrice(p);
                if (!double.IsNaN(newPrice) && TickSize > 0)
                {
                    newPrice = RoundToTick(newPrice);
                    if (draggingLine == 1 && entryLine != null)
                        MoveLine(entryLine, newPrice);
                    else if (draggingLine == 2 && stopLine != null)
                        MoveLine(stopLine, newPrice);
                    ForceRefresh();
                }
                e.Handled = true;
                return;
            }

            if (resizingBox)
            {
                if (ChartPanel == null) return;
                float pW = (float)ChartPanel.W;
                float pX = (float)ChartPanel.X;
                if (pW <= 0) return;

                double newRight = (p.X - pX) / pW;
                newRight = Math.Max(boxLeftFrac + 0.05, Math.Min(0.98, newRight));
                boxRightFrac = newRight;

                ForceRefresh();
                e.Handled = true;
                return;
            }
        }

        private void OnMouseUp(object sender, MouseButtonEventArgs e)
        {
            draggingLine = 0;
            resizingBox = false;
            draggingBtn = false;
        }

        private double MouseToPrice(Point mousePt)
        {
            try
            {
                if (ChartPanel == null) return double.NaN;
                for (int i = 0; i < ChartPanel.Scales.Count; i++)
                {
                    ChartScale s = ChartPanel.Scales[i];
                    if (s == null) continue;
                    double v = s.GetValueByY((float)mousePt.Y);
                    if (!double.IsNaN(v) && !double.IsInfinity(v)) return v;
                }
                return double.NaN;
            }
            catch { return double.NaN; }
        }

        private ChartScale GetPriceScale()
        {
            try
            {
                if (ChartPanel == null) return null;
                for (int i = 0; i < ChartPanel.Scales.Count; i++)
                {
                    ChartScale s = ChartPanel.Scales[i];
                    if (s != null) return s;
                }
            }
            catch { }
            return null;
        }

        #endregion

        #region Bundle

        private void DropBundle(double entryPrice)
        {
            if (CurrentBar < 0 || TickSize <= 0) return;

            RemoveBundleDrawings();

            double entry = RoundToTick(entryPrice);
            double stopDist = Math.Max(1, DefaultStopTicks) * TickSize;
            double stop = RoundToTick(entry - stopDist);
            double riskPts = Math.Abs(entry - stop);

            entryLine = Draw.HorizontalLine(this, tagEntry, false, entry, Brushes.Cyan, DashStyleHelper.Solid, 2);
            stopLine  = Draw.HorizontalLine(this, tagStop,  false, stop,  Brushes.Red,  DashStyleHelper.Solid, 2);
            tp1Line   = Draw.HorizontalLine(this, tagTP1,   false, RoundToTick(entry + riskPts * Tp1R), Brushes.LimeGreen, DashStyleHelper.Dash, 2);
            tp2Line   = Draw.HorizontalLine(this, tagTP2,   false, RoundToTick(entry + riskPts * Tp2R), Brushes.LimeGreen, DashStyleHelper.Dash, 2);
            tp3Line   = Draw.HorizontalLine(this, tagTP3,   false, RoundToTick(entry + riskPts * Tp3R), Brushes.LimeGreen, DashStyleHelper.Dash, 2);

            UnlockAll();
            bundleActive = true;
            ForceRefresh();
        }

        private void ClearBundle()
        {
            RemoveBundleDrawings();
            entryLine = null; stopLine = null;
            tp1Line = null; tp2Line = null; tp3Line = null;
            bundleActive = false;
            armed = false;
            ForceRefresh();
        }

        private void RefreshBundle()
        {
            if (!bundleActive) return;

            entryLine = FindLine(tagEntry);
            stopLine  = FindLine(tagStop);
            tp1Line   = FindLine(tagTP1);
            tp2Line   = FindLine(tagTP2);
            tp3Line   = FindLine(tagTP3);

            if (entryLine == null || stopLine == null)
            {
                bundleActive = false;
                return;
            }

            UnlockAll();

            double entry = GetPrice(entryLine);
            double stop  = GetPrice(stopLine);
            if (double.IsNaN(entry) || double.IsNaN(stop)) return;

            double riskPts = Math.Abs(entry - stop);
            if (riskPts < TickSize * 0.5) return;

            int dir = stop < entry ? 1 : -1;

            MoveLine(tp1Line, RoundToTick(entry + dir * riskPts * Tp1R));
            MoveLine(tp2Line, RoundToTick(entry + dir * riskPts * Tp2R));
            MoveLine(tp3Line, RoundToTick(entry + dir * riskPts * Tp3R));

            // Readout
            double riskDollars = ComputeRisk();
            double pv = Instrument.MasterInstrument.PointValue;
            double riskPerCtr = riskPts * pv;
            int qty = riskPerCtr > 0 ? (int)Math.Floor(riskDollars / riskPerCtr) : 0;
            bool over = false;
            if (qty < 1) { qty = 1; over = true; }
            double actualRisk = qty * riskPerCtr;
            double maxR = Math.Max(Tp1R, Math.Max(Tp2R, Tp3R));
            double targetDollars = qty * Math.Abs(dir * riskPts * maxR) * pv;
            string side = dir > 0 ? "LONG" : "SHORT";

            string txt = string.Format(
                "XRisk {0} | Risk ${1:0} | Qty {2} | R:R {3:0.#}:1 | Entry {4:0.##} | Stop {5:0.##} | Target ${6:0.00}{7}",
                side, riskDollars, qty, maxR, entry, stop, targetDollars, over ? "  ⚠" : "");

            Draw.TextFixed(
                this, tagReadout, txt,
                TextPosition.BottomLeft,
                Brushes.White,
                new SimpleFont("Arial", 13),
                new SolidColorBrush(Color.FromArgb(200, 10, 12, 18)),
                new SolidColorBrush(Color.FromArgb(100, 40, 40, 50)),
                50);

            ForceRefresh();
        }

        #endregion

        #region OnRender — bounded box, lines only within box, resize handle

        protected override void OnRender(ChartControl chartControl, ChartScale chartScale)
        {
            base.OnRender(chartControl, chartScale);

            if (ChartPanel == null || chartControl == null || chartScale == null) return;
            if (Instrument == null || Instrument.MasterInstrument == null || TickSize <= 0) return;

            float pX = (float)ChartPanel.X;
            float pY = (float)ChartPanel.Y;
            float pW = (float)ChartPanel.W;
            float pH = (float)ChartPanel.H;
            if (pW <= 20 || pH <= 20) return;

            // ── Armed preview line at mouse Y ──
            if (armed)
            {
                Point mp = Mouse.GetPosition(chartControl);
                double previewPrice = chartScale.GetValueByY((float)mp.Y);
                if (!double.IsNaN(previewPrice) && !double.IsInfinity(previewPrice))
                {
                    float yPreview = chartScale.GetYByValue(RoundToTick(previewPrice));
                    if (Usable(yPreview))
                    {
                        float xL = pX + 4;
                        float xR = pX + pW - 4;

                        var cCyan = new SharpDX.Color4(0.25f, 0.85f, 1f, 0.60f);
                        var cDark = new SharpDX.Color4(0.02f, 0.03f, 0.04f, 0.85f);
                        var cWhite = new SharpDX.Color4(1f, 1f, 1f, 0.90f);

                        using (var bCyan = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cCyan))
                        using (var bDark = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cDark))
                        using (var bWhite = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cWhite))
                        {
                            // Dashed preview line across full width
                            RenderTarget.DrawLine(
                                new SharpDX.Vector2(xL, yPreview),
                                new SharpDX.Vector2(xR, yPreview), bCyan, 1.5f);

                            string previewText = string.Format("Entry {0}  ← click to drop", Fmt(RoundToTick(previewPrice)));
                            float lblW = 200, lblH = 22;
                            float lblX = xR - lblW - 6;
                            float lblY = Math.Max(pY + 2, Math.Min(pY + pH - lblH - 2, yPreview - lblH / 2f));

                            var rect = new SharpDX.RectangleF(lblX, lblY, lblW, lblH);
                            var rounded = new SharpDX.Direct2D1.RoundedRectangle { Rect = rect, RadiusX = 4, RadiusY = 4 };
                            RenderTarget.FillRoundedRectangle(rounded, bDark);
                            RenderTarget.DrawRoundedRectangle(rounded, bCyan, 1f);

                            using (var fmt = new SimpleFont("Arial", 11f).ToDirectWriteTextFormat())
                            {
                                fmt.TextAlignment = SharpDX.DirectWrite.TextAlignment.Center;
                                fmt.ParagraphAlignment = SharpDX.DirectWrite.ParagraphAlignment.Center;
                                RenderTarget.DrawText(previewText, fmt, rect, bWhite);
                            }
                        }
                    }
                }
                return;
            }

            if (!bundleActive) return;

            double entry = GetPrice(entryLine);
            double stop  = GetPrice(stopLine);
            if (double.IsNaN(entry) || double.IsNaN(stop)) return;

            double riskPts = Math.Abs(entry - stop);
            if (riskPts < TickSize * 0.5) return;

            int dir = stop < entry ? 1 : -1;
            double maxR = Math.Max(Tp1R, Math.Max(Tp2R, Tp3R));
            double tp1 = RoundToTick(entry + dir * riskPts * Tp1R);
            double tp2 = RoundToTick(entry + dir * riskPts * Tp2R);
            double tp3 = RoundToTick(entry + dir * riskPts * Tp3R);
            double target = RoundToTick(entry + dir * riskPts * maxR);

            // Sizing
            double riskDollars = ComputeRisk();
            double pv = Instrument.MasterInstrument.PointValue;
            double riskPerCtr = riskPts * pv;
            int qty = riskPerCtr > 0 ? (int)Math.Floor(riskDollars / riskPerCtr) : 0;
            bool over = false;
            if (qty < 1) { qty = 1; over = true; }
            double actualRisk = qty * riskPerCtr;
            double targetDollars = qty * Math.Abs(target - entry) * pv;
            string side = dir > 0 ? "LONG" : "SHORT";

            // Bounded box (NOT full screen — uses boxLeftFrac / boxRightFrac)
            float boxL = pX + (float)(boxLeftFrac * pW);
            float boxR = pX + (float)(boxRightFrac * pW);
            float boxW = boxR - boxL;

            float yEntry  = chartScale.GetYByValue(entry);
            float yStop   = chartScale.GetYByValue(stop);
            float yTarget = chartScale.GetYByValue(target);
            float yTp1    = chartScale.GetYByValue(tp1);
            float yTp2    = chartScale.GetYByValue(tp2);
            float yTp3    = chartScale.GetYByValue(tp3);

            if (!Usable(yEntry) || !Usable(yStop) || !Usable(yTarget)) return;

            float rewardTop    = Math.Min(yEntry, yTarget);
            float rewardBottom = Math.Max(yEntry, yTarget);
            float riskTop      = Math.Min(yEntry, yStop);
            float riskBottom   = Math.Max(yEntry, yStop);
            float boxTop       = Math.Min(rewardTop, riskTop);
            float boxBottom    = Math.Max(rewardBottom, riskBottom);

            // Colors
            var cRF = new SharpDX.Color4(0.08f, 0.65f, 0.25f, 0.14f);
            var cSF = new SharpDX.Color4(0.80f, 0.10f, 0.10f, 0.15f);
            var cG  = new SharpDX.Color4(0.15f, 0.85f, 0.30f, 0.90f);
            var cR  = new SharpDX.Color4(0.92f, 0.22f, 0.22f, 0.90f);
            var cC  = new SharpDX.Color4(0.20f, 0.80f, 0.95f, 0.90f);
            var cW  = new SharpDX.Color4(1f, 1f, 1f, 0.95f);
            var cGT = new SharpDX.Color4(0.25f, 0.95f, 0.40f, 0.95f);
            var cRT = new SharpDX.Color4(1.0f, 0.35f, 0.35f, 0.95f);
            var cCT = new SharpDX.Color4(0.30f, 0.90f, 1.00f, 0.95f);
            var cD  = new SharpDX.Color4(0.02f, 0.03f, 0.04f, 0.85f);
            var cBd = new SharpDX.Color4(0.45f, 0.45f, 0.50f, 0.35f);
            var cHandle = new SharpDX.Color4(0.90f, 0.90f, 0.40f, 0.80f);

            using (var bRF = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cRF))
            using (var bSF = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cSF))
            using (var bG  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cG))
            using (var bR  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cR))
            using (var bC  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cC))
            using (var bW  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cW))
            using (var bGT = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cGT))
            using (var bRT = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cRT))
            using (var bCT = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cCT))
            using (var bD  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cD))
            using (var bBd = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cBd))
            using (var bH  = new SharpDX.Direct2D1.SolidColorBrush(RenderTarget, cHandle))
            {
                // Reward box (entry → target)
                RenderTarget.FillRectangle(
                    new SharpDX.RectangleF(boxL, rewardTop, boxW, Math.Max(2, rewardBottom - rewardTop)), bRF);

                // Risk box (entry → stop)
                RenderTarget.FillRectangle(
                    new SharpDX.RectangleF(boxL, riskTop, boxW, Math.Max(2, riskBottom - riskTop)), bSF);

                // Lines — ONLY within box bounds
                DxLine(boxL, yEntry,  boxR, yEntry,  bC, 2.5f);
                DxLine(boxL, yStop,   boxR, yStop,   bR, 2.5f);
                DxLine(boxL, yTarget, boxR, yTarget, bG, 2f);
                if (Usable(yTp1)) DxLine(boxL, yTp1, boxR, yTp1, bG, 1f);
                if (Usable(yTp2)) DxLine(boxL, yTp2, boxR, yTp2, bG, 1f);
                if (Usable(yTp3)) DxLine(boxL, yTp3, boxR, yTp3, bG, 1f);

                // Outer border
                RenderTarget.DrawRectangle(
                    new SharpDX.RectangleF(boxL, boxTop, boxW, Math.Max(2, boxBottom - boxTop)), bBd, 1f);

                // Resize handle (bottom-right corner — small square)
                float hs = 12;
                RenderTarget.FillRectangle(
                    new SharpDX.RectangleF(boxR - hs, boxBottom - hs, hs, hs), bH);
                RenderTarget.DrawRectangle(
                    new SharpDX.RectangleF(boxR - hs, boxBottom - hs, hs, hs), bBd, 1f);

                // Labels at line levels (right side of box, NOT stacked)
                float labelX = boxR - 240;
                if (labelX < boxL + 6) labelX = boxL + 6;

                RightLabel(string.Format("Target  {0}  +${1:0.00}", Fmt(target), targetDollars),
                    boxR, yTarget, pY, pH, bD, bG, bGT);

                RightLabel(string.Format("{0}  Entry  {1}  Qty {2}  {3:0.#}:1  ${4:0}{5}",
                    side, Fmt(entry), qty, maxR, (int)actualRisk, over ? " ⚠" : ""),
                    boxR, yEntry, pY, pH, bD, bC, bCT);

                RightLabel(string.Format("Stop  {0}  -${1:0.00}", Fmt(stop), actualRisk),
                    boxR, yStop, pY, pH, bD, bR, bRT);
            }
        }

        private void RightLabel(string text, float xRight, float yLine, float pY, float pH,
            SharpDX.Direct2D1.Brush bg, SharpDX.Direct2D1.Brush outline, SharpDX.Direct2D1.Brush fg)
        {
            float w = 235, h = 22;
            float x = xRight - w - 2;
            if (x < pY + 4) x = pY + 4;
            float y = yLine - h / 2f;
            y = Math.Max(pY + 2, Math.Min(pY + pH - h - 2, y));

            var rect = new SharpDX.RectangleF(x, y, w, h);
            var rounded = new SharpDX.Direct2D1.RoundedRectangle { Rect = rect, RadiusX = 4, RadiusY = 4 };
            RenderTarget.FillRoundedRectangle(rounded, bg);
            RenderTarget.DrawRoundedRectangle(rounded, outline, 1f);

            using (var fmt = new SimpleFont("Arial", 11f).ToDirectWriteTextFormat())
            {
                fmt.TextAlignment = SharpDX.DirectWrite.TextAlignment.Leading;
                fmt.ParagraphAlignment = SharpDX.DirectWrite.ParagraphAlignment.Center;
                var textRect = new SharpDX.RectangleF(x + 8, y, w - 12, h);
                RenderTarget.DrawText(text, fmt, textRect, fg);
            }
        }

        #endregion

        #region Helpers

        private bool Usable(float v) => !float.IsNaN(v) && !float.IsInfinity(v) && Math.Abs(v) < 100000f;

        private void DxLine(float x1, float y1, float x2, float y2, SharpDX.Direct2D1.Brush b, float w)
        {
            if (!Usable(y1) || !Usable(y2)) return;
            RenderTarget.DrawLine(new SharpDX.Vector2(x1, y1), new SharpDX.Vector2(x2, y2), b, w);
        }

        private void RemoveBundleDrawings()
        {
            RemoveDrawObject(tagEntry);
            RemoveDrawObject(tagStop);
            RemoveDrawObject(tagTP1);
            RemoveDrawObject(tagTP2);
            RemoveDrawObject(tagTP3);
            RemoveDrawObject(tagReadout);
        }

        private HorizontalLine FindLine(string tag)
        {
            if (string.IsNullOrEmpty(tag) || DrawObjects == null) return null;
            try
            {
                foreach (DrawingTool obj in DrawObjects)
                    if (obj != null && obj.Tag == tag) return obj as HorizontalLine;
            }
            catch { }
            return null;
        }

        private void UnlockAll()
        {
            Unlock(entryLine); Unlock(stopLine);
            Unlock(tp1Line); Unlock(tp2Line); Unlock(tp3Line);
        }

        private void Unlock(HorizontalLine l) { if (l != null) try { l.IsLocked = false; } catch { } }

        private double GetPrice(HorizontalLine l)
        {
            if (l == null || l.StartAnchor == null) return double.NaN;
            try { return l.StartAnchor.Price; } catch { return double.NaN; }
        }

        private void MoveLine(HorizontalLine l, double price)
        {
            if (l == null || l.StartAnchor == null) return;
            try { l.StartAnchor.Price = RoundToTick(price); l.IsLocked = false; } catch { }
        }

        private double ComputeRisk()
        {
            switch (Mode)
            {
                case XRiskMode.Survival:   return 25;
                case XRiskMode.Defensive:  return 30;
                case XRiskMode.Cautious:   return 35;
                case XRiskMode.Balanced:   return 40;
                case XRiskMode.Confident:  return 45;
                case XRiskMode.Aggressive: return 50;
                case XRiskMode.Eval:       return EvalRiskDollars > 0 ? EvalRiskDollars : 50;
                default:                   return 25;
            }
        }

        private double RoundToTick(double p) => TickSize <= 0 ? p : Math.Round(p / TickSize, MidpointRounding.AwayFromZero) * TickSize;

        private string Fmt(double p) => p.ToString("0.########");

        #endregion
    }
}

namespace NinjaTrader.NinjaScript.Indicators
{
    public partial class Indicator : NinjaTrader.Gui.NinjaScript.IndicatorRenderBase
    {
        private XRiskTool[] cacheXRiskTool;
        public XRiskTool XRiskTool(XRiskMode mode, double evalRiskDollars, int defaultStopTicks, double tp1R, double tp2R, double tp3R)
        {
            return cacheXRiskTool[0] = new XRiskTool
            {
                Mode = mode,
                EvalRiskDollars = evalRiskDollars,
                DefaultStopTicks = defaultStopTicks,
                Tp1R = tp1R,
                Tp2R = tp2R,
                Tp3R = tp3R
            };
        }
    }
}

#region NinjaScript generated code. Neither change nor remove.
#endregion
