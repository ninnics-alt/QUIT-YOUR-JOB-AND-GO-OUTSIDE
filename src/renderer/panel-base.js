/**
 * PANEL-BASE.JS - Reusable panel component base class
 * Handles header, toolbar, content canvas, status line, and interactions
 */

class Panel {
  constructor(options = {}) {
    this.id = options.id || 'panel-' + Math.random().toString(36).slice(2);
    this.title = options.title || 'Panel';
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.width = options.width || 300;
    this.height = options.height || 200;
    this.detailLevel = options.detailLevel || 'med'; // 'low', 'med', 'high'
    this.isCollapsed = false;
    this.isHovered = false;
    
    // Canvas setup
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
    
    // Optional toolbar buttons
    this.toolbar = options.toolbar || [];
    
    // Status line (e.g., "Peak: 0.5 | Clip: No")
    this.statusText = '';
    
    // For smooth transitions
    this.animatingValues = {};
    
    // Cache for static elements
    this.cachedBackground = null;
    this.cachedGradients = {};
    this.cachedPatterns = {};
    this.isDirty = true;
    
    // Theme version tracking for cache invalidation
    this.lastThemeVersion = -1;
  }

  /**
   * Render the entire panel (chrome + content)
   */
  render(parentCtx) {
    // Check if theme has changed and invalidate caches
    if (typeof THEME !== 'undefined' && THEME.version !== this.lastThemeVersion) {
      this._invalidateThemeCaches();
      this.lastThemeVersion = THEME.version;
    }
    
    // Header
    this._renderHeader(parentCtx);
    
    // Content area
    this._renderContent(parentCtx);
    
    // Status line
    this._renderStatusLine(parentCtx);
    
    // Toolbar
    this._renderToolbar(parentCtx);
  }
  
  /**
   * Invalidate all theme-dependent caches
   * @private
   */
  _invalidateThemeCaches() {
    // Clear cached gradients and patterns
    this.cachedGradients = {};
    this.cachedPatterns = {};
    this.cachedBackground = null;
    
    // Clear any offscreen/persistence canvases
    if (this.persistBuffer) {
      const ctx = this.persistBuffer.getContext('2d');
      ctx && ctx.clearRect(0, 0, this.persistBuffer.width, this.persistBuffer.height);
    }
    
    if (this.offscreenBuffer) {
      const ctx = this.offscreenBuffer.getContext('2d');
      ctx && ctx.clearRect(0, 0, this.offscreenBuffer.width, this.offscreenBuffer.height);
    }
    
    // Mark panel as dirty for full redraw
    this.isDirty = true;
  }

  /**
   * Render panel header with title and detail toggle
   */
  _renderHeader(ctx) {
    const headerH = 28;
    const { spacing, colors, fonts } = THEME;
    
    // Background
    ctx.fillStyle = colors.bgTertiary;
    ctx.fillRect(this.x, this.y, this.width, headerH);
    
    // Border
    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, this.y, this.width, headerH);
    
    // Title
    ctx.fillStyle = colors.textPrimary;
    ctx.font = fonts.sansBold;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.title, this.x + spacing.md, this.y + headerH / 2);
    
    // Collapse button (right side)
    const btnW = 20;
    const btnX = this.x + this.width - spacing.md - btnW;
    const btnY = this.y + (headerH - btnW) / 2;
    ctx.fillStyle = this.isHovered ? colors.accentBlue : colors.textSecondary;
    ctx.font = fonts.mono;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.isCollapsed ? '▶' : '▼', btnX + btnW / 2, btnY + btnW / 2);
  }

  /**
   * Render the content drawing area (placeholder; override in subclasses)
   */
  _renderContent(ctx) {
    const headerH = 28;
    const contentY = this.y + headerH;
    const contentH = this.height - headerH - 24; // Leave room for status line
    
    // Content background
    ctx.fillStyle = THEME.colors.bgSecondary;
    ctx.fillRect(this.x, contentY, this.width, contentH);
    
    // Centered placeholder text
    ctx.fillStyle = THEME.colors.textTertiary;
    ctx.font = THEME.fonts.mono;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('[Panel Content]', this.x + this.width / 2, contentY + contentH / 2);
    
    // Add scanlines overlay if detail level is high
    if (this.detailLevel === 'high') {
      UIHelpers.drawScanlines(ctx, this.x, contentY, this.width, contentH);
    }
  }

  /**
   * Render status line at bottom
   */
  _renderStatusLine(ctx) {
    const lineH = 20;
    const statusY = this.y + this.height - lineH;
    const { spacing, colors, fonts } = THEME;
    
    // Background
    ctx.fillStyle = colors.bgPrimary;
    ctx.fillRect(this.x, statusY, this.width, lineH);
    
    // Border
    ctx.strokeStyle = colors.gridLight;
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x, statusY, this.width, lineH);
    
    // Text
    ctx.fillStyle = colors.textSecondary;
    ctx.font = fonts.monoSmall;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.statusText || 'Ready', this.x + spacing.sm, statusY + lineH / 2);
  }

  /**
   * Render optional toolbar (buttons/toggles)
   */
  _renderToolbar(ctx) {
    if (this.toolbar.length === 0) return;
    
    const btnH = 24;
    const btnSpacing = 6;
    const { colors, fonts, spacing } = THEME;
    const cornerRadius = 2;
    
    let xPos = this.x + spacing.md;
    
    this.toolbar.forEach((btn, idx) => {
      const btnW = btn.width || 60;
      const btnX = xPos;
      const btnY = this.y + spacing.sm;
      
      // Background
      ctx.fillStyle = btn.isActive ? colors.accentBlue : colors.bgTertiary;
      UIHelpers.roundRect(ctx, btnX, btnY, btnW, btnH, cornerRadius);
      ctx.fill();
      
      // Border
      ctx.strokeStyle = colors.gridLight;
      ctx.lineWidth = 1;
      UIHelpers.roundRect(ctx, btnX, btnY, btnW, btnH, cornerRadius);
      ctx.stroke();
      
      // Label
      ctx.fillStyle = btn.isActive ? colors.bgPrimary : colors.textPrimary;
      ctx.font = fonts.monoSmall;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btnX + btnW / 2, btnY + btnH / 2);
      
      xPos += btnW + btnSpacing;
    });
  }

  /**
   * Update panel position and size
   */
  setPosition(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.isDirty = true;
  }

  /**
   * Set status text
   */
  setStatus(text) {
    this.statusText = text;
  }

  /**
   * Toggle detail level
   */
  cycleDetailLevel() {
    const levels = ['low', 'med', 'high'];
    const idx = levels.indexOf(this.detailLevel);
    this.detailLevel = levels[(idx + 1) % levels.length];
    this.isDirty = true;
  }

  /**
   * Check if click is within panel
   */
  contains(x, y) {
    return x >= this.x && x < this.x + this.width && y >= this.y && y < this.y + this.height;
  }

  /**
   * Mouse hover
   */
  setHovered(hovered) {
    if (this.isHovered !== hovered) {
      this.isHovered = hovered;
      this.isDirty = true;
    }
  }

  /**
   * Collapse/expand
   */
  toggle() {
    this.isCollapsed = !this.isCollapsed;
    this.isDirty = true;
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Panel };
}
if (typeof window !== 'undefined') {
  window.Panel = Panel;
}
