#!/usr/bin/env node

/**
 * DEAR HILLS — Dedicated Mobile Experience Lab & Device Simulator Server
 * 
 * Runs a standalone preview server on port 4100 that provides:
 * 1. High-fidelity Mobile Device Simulator Shell (iPhone 16 Pro, S24, iPhone SE, etc.)
 *    with device frame, dynamic island, rotation, scale/fit, touch emulation, and quick route jumps.
 * 2. Reverse proxy to live production (https://dearhills.in) or local backend (http://localhost:8787)
 *    that strips CSP frame-ancestors and X-Frame-Options to allow seamless iframe rendering.
 * 3. LAN Wi-Fi access for physical phones (http://<LAN_IP>:4100) with automatic mobile UA detection.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import zlib from 'node:zlib';
import os from 'node:os';

const PORT = parseInt(process.env.PORT || '4100', 10);
const DEFAULT_TARGET = process.env.TARGET || 'https://www.dearhills.in';
const LOCAL_TARGET = process.env.LOCAL_TARGET || 'http://localhost:8787';

// Detect primary non-internal IPv4 address
function getLocalIp() {
  const nets = os.networkInterfaces();
  let candidate = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wireless') || name.toLowerCase().includes('wlan')) {
          return net.address;
        }
        candidate = net.address;
      }
    }
  }
  return candidate;
}

const LAN_IP = getLocalIp();

// Device Presets
const DEVICES = {
  'iphone-16-pro': { name: 'iPhone 16 Pro', width: 393, height: 852, dpr: 3, frame: 'island', radius: 48 },
  'iphone-15': { name: 'iPhone 15 / 14', width: 390, height: 844, dpr: 3, frame: 'island', radius: 44 },
  'iphone-se': { name: 'iPhone SE (3rd Gen)', width: 375, height: 667, dpr: 2, frame: 'classic', radius: 24 },
  'galaxy-s24': { name: 'Samsung Galaxy S24', width: 412, height: 915, dpr: 2.6, frame: 'punch', radius: 42 },
  'compact-android': { name: 'Compact Android', width: 360, height: 780, dpr: 2, frame: 'punch', radius: 36 },
  'ipad-mini': { name: 'iPad Mini (Tablet)', width: 768, height: 1024, dpr: 2, frame: 'tablet', radius: 28 },
};

function isMobileUserAgent(ua = '') {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

// Injected helper script in proxied HTML to communicate route changes with parent simulator
const INJECTED_HELPER_SCRIPT = `
<!-- DEAR HILLS MOBILE PREVIEW HELPER -->
<script id="__dh_mobile_helper">
(function() {
  function cleanPath(urlStr) {
    try {
      const u = new URL(urlStr, window.location.origin);
      u.searchParams.delete('__dh_inner');
      u.searchParams.delete('app');
      u.searchParams.delete('t');
      const search = u.search;
      return u.pathname + (search && search !== '?' ? search : '') + u.hash;
    } catch (e) {
      return urlStr.replace(/[?&]__dh_inner=1/g, '').replace(/[?&]app=(1|true)/g, '').replace(/[?&]t=\\d+/g, '').replace(/\\?$/, '');
    }
  }

  function sendRouteToParent() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'DH_SIMULATOR_ROUTE',
          path: cleanPath(window.location.pathname + window.location.search + window.location.hash),
          title: document.title
        }, '*');
      }
    } catch (e) {}
  }
  
  // Hook into SPA navigation
  const origPush = history.pushState;
  history.pushState = function() {
    const ret = origPush.apply(this, arguments);
    sendRouteToParent();
    return ret;
  };
  const origReplace = history.replaceState;
  history.replaceState = function() {
    const ret = origReplace.apply(this, arguments);
    sendRouteToParent();
    return ret;
  };
  window.addEventListener('popstate', sendRouteToParent);
  window.addEventListener('load', sendRouteToParent);
  document.addEventListener('DOMContentLoaded', sendRouteToParent);

  // Listen for commands from simulator parent
  window.addEventListener('message', function(event) {
    if (!event.data) return;
    if (event.data.type === 'DH_SIMULATOR_NAVIGATE') {
      let target = event.data.path;
      if (target) {
        const hasQuery = target.includes('?');
        const innerTarget = target + (hasQuery ? '&' : '?') + '__dh_inner=1';
        if (cleanPath(target) !== cleanPath(window.location.pathname + window.location.search)) {
          window.location.href = innerTarget;
        }
      }
    } else if (event.data.type === 'DH_SIMULATOR_RELOAD') {
      window.location.reload();
    } else if (event.data.type === 'DH_SIMULATOR_BACK') {
      window.history.back();
    } else if (event.data.type === 'DH_SIMULATOR_FORWARD') {
      window.history.forward();
    }
  });

  // Touch emulation indicator (optional visual enhancement)
  document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = 'body { -webkit-tap-highlight-color: rgba(217, 130, 99, 0.2); }';
    document.head.appendChild(style);
  });
})();
</script>
`;

/**
 * Generates the Simulator Shell HTML
 */
function renderSimulatorShell({ initialPath = '/', initialTarget = 'production' }) {
  const cleanInitialPath = initialPath.replace(/[?&]__dh_inner=1/g, '').replace(/[?&]app=(1|true)/g, '').replace(/\?$/, '') || '/';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEAR HILLS — Mobile Device Simulator (Port ${PORT})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --c-forest: #101918;
      --c-pine: #172321;
      --c-pine-light: #20312e;
      --c-pine-border: #2a3e3b;
      --c-ivory: #F7F1E7;
      --c-sand: #E4DACE;
      --c-terracotta: #D98263;
      --c-butter: #F4E8CE;
      --c-gold: #C89D5C;
      --c-green: #10b981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--c-forest);
      color: var(--c-ivory);
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
    }

    /* TOP HEADER TOOLBAR */
    .toolbar {
      background: var(--c-pine);
      border-bottom: 1px solid var(--c-pine-border);
      padding: 10px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      z-index: 50;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      color: inherit;
    }

    .brand-emblem {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--c-terracotta) 0%, #b86245 100%);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(217, 130, 99, 0.4);
    }

    .brand-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--c-ivory);
      line-height: 1;
    }

    .brand-badge {
      font-family: 'Manrope', sans-serif;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 3px 8px;
      border-radius: 12px;
      background: rgba(16, 185, 129, 0.18);
      color: var(--c-green);
      border: 1px solid rgba(16, 185, 129, 0.4);
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .brand-badge::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--c-green);
      border-radius: 50%;
      box-shadow: 0 0 8px var(--c-green);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    /* CONTROLS CLUSTER */
    .controls-cluster {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .control-group {
      display: flex;
      align-items: center;
      background: var(--c-forest);
      border: 1px solid var(--c-pine-border);
      border-radius: 8px;
      padding: 3px 6px;
      gap: 6px;
    }

    .control-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--c-sand);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding-left: 4px;
    }

    select, button, input {
      font-family: 'Manrope', sans-serif;
      font-size: 12px;
    }

    select {
      background: var(--c-pine);
      color: var(--c-ivory);
      border: 1px solid var(--c-pine-border);
      border-radius: 6px;
      padding: 5px 8px;
      outline: none;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    select:hover, select:focus {
      border-color: var(--c-terracotta);
    }

    .btn {
      background: var(--c-pine);
      color: var(--c-ivory);
      border: 1px solid var(--c-pine-border);
      border-radius: 6px;
      padding: 5px 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn:hover {
      background: var(--c-pine-light);
      border-color: var(--c-sand);
      color: #fff;
    }

    .btn.active {
      background: var(--c-terracotta);
      border-color: var(--c-terracotta);
      color: #fff;
    }

    .btn-icon {
      padding: 6px 8px;
    }

    .btn-primary {
      background: var(--c-terracotta);
      border-color: var(--c-terracotta);
      color: #fff;
    }

    .btn-primary:hover {
      background: #c97254;
      border-color: #c97254;
    }

    /* SECONDARY LOCATION & QUICK ROUTES BAR */
    .subbar {
      background: #131d1b;
      border-bottom: 1px solid var(--c-pine-border);
      padding: 8px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-shrink: 0;
    }

    .address-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--c-forest);
      border: 1px solid var(--c-pine-border);
      border-radius: 8px;
      padding: 4px 8px;
      flex: 1;
      max-width: 520px;
    }

    .nav-arrow {
      background: none;
      border: none;
      color: var(--c-sand);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
    }

    .nav-arrow:hover {
      color: #fff;
      background: var(--c-pine);
    }

    .address-input-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1;
      background: var(--c-pine);
      border-radius: 6px;
      padding: 4px 8px;
      border: 1px solid rgba(255,255,255,0.06);
    }

    .address-lock {
      color: var(--c-green);
      font-size: 12px;
    }

    .address-input {
      background: transparent;
      border: none;
      color: var(--c-ivory);
      font-size: 12px;
      width: 100%;
      outline: none;
      font-family: monospace;
    }

    .btn-go {
      background: var(--c-pine-light);
      border: 1px solid var(--c-pine-border);
      color: var(--c-ivory);
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
    }

    .btn-go:hover {
      background: var(--c-terracotta);
      border-color: var(--c-terracotta);
    }

    .quick-routes {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }

    .quick-routes::-webkit-scrollbar { display: none; }

    .route-chip {
      background: var(--c-pine);
      border: 1px solid var(--c-pine-border);
      color: var(--c-sand);
      padding: 4px 9px;
      border-radius: 14px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .route-chip:hover {
      background: var(--c-pine-light);
      border-color: var(--c-terracotta);
      color: var(--c-ivory);
    }

    .route-chip.active {
      background: rgba(217, 130, 99, 0.2);
      border-color: var(--c-terracotta);
      color: var(--c-terracotta);
      font-weight: 700;
    }

    /* MAIN STAGE / DEVICE VIEWPORT */
    .stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: auto;
      padding: 24px;
      background: radial-gradient(circle at center, #162220 0%, #0d1514 100%);
    }

    /* SIMULATOR WRAPPER (FOR ZOOM / SCALE TRANSFORM) */
    .simulator-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      transform-origin: center center;
    }

    /* PHONE CHASSIS */
    .phone-chassis {
      position: relative;
      background: #000;
      border: 12px solid #232b2a;
      border-radius: 48px;
      box-shadow: 
        0 0 0 1px rgba(255, 255, 255, 0.08),
        0 25px 60px -15px rgba(0, 0, 0, 0.8),
        0 10px 25px -5px rgba(0, 0, 0, 0.5);
      transition: width 0.25s ease, height 0.25s ease, border-radius 0.25s ease;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .phone-chassis.no-frame {
      border: none !important;
      border-radius: 0 !important;
      box-shadow: 0 15px 40px rgba(0,0,0,0.6) !important;
    }

    /* HARDWARE BUTTONS (OUTSIDE BEZEL) */
    .phone-chassis::before {
      content: '';
      position: absolute;
      left: -15px;
      top: 110px;
      width: 3px;
      height: 32px;
      background: #1a2221;
      border-radius: 2px 0 0 2px;
    }

    .phone-chassis::after {
      content: '';
      position: absolute;
      right: -15px;
      top: 140px;
      width: 3px;
      height: 54px;
      background: #1a2221;
      border-radius: 0 2px 2px 0;
    }

    .phone-chassis.no-frame::before,
    .phone-chassis.no-frame::after {
      display: none;
    }

    /* TOP STATUS BAR */
    .phone-status-bar {
      height: 42px;
      background: #101918;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      font-size: 12px;
      font-weight: 600;
      color: #fff;
      z-index: 20;
      flex-shrink: 0;
      position: relative;
    }

    .phone-chassis.no-frame .phone-status-bar {
      display: none;
    }

    .status-time {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
      font-size: 13px;
      font-weight: 600;
    }

    .dynamic-island {
      position: absolute;
      left: 50%;
      top: 8px;
      transform: translateX(-50%);
      width: 110px;
      height: 28px;
      background: #000;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 10px;
      box-shadow: 0 0 1px 1px rgba(255,255,255,0.05);
    }

    .camera-lens {
      width: 10px;
      height: 10px;
      background: radial-gradient(circle at 35% 35%, #1e293b, #000);
      border-radius: 50%;
      border: 1px solid #111;
      margin-left: auto;
    }

    .status-icons {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
    }

    /* SCREEN IFRAME */
    .phone-screen {
      flex: 1;
      width: 100%;
      height: 100%;
      background: #FAF7F2;
      position: relative;
      overflow: hidden;
    }

    .phone-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: #FAF7F2;
    }

    /* BOTTOM HOME INDICATOR */
    .home-indicator-bar {
      height: 20px;
      background: #101918;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .phone-chassis.no-frame .home-indicator-bar {
      display: none;
    }

    .home-indicator-pill {
      width: 135px;
      height: 4px;
      background: rgba(255, 255, 255, 0.4);
      border-radius: 3px;
    }

    /* BOTTOM FOOTER / INFO PILL */
    .footer-pill {
      position: absolute;
      bottom: 14px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(23, 35, 33, 0.85);
      backdrop-filter: blur(8px);
      border: 1px solid var(--c-pine-border);
      border-radius: 20px;
      padding: 6px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      color: var(--c-sand);
      box-shadow: 0 4px 15px rgba(0,0,0,0.4);
      z-index: 30;
    }

    .footer-pill strong {
      color: var(--c-ivory);
    }

    /* MODAL FOR QR CODE & PHYSICAL DEVICE CONNECT */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }

    .modal-overlay.open {
      display: flex;
    }

    .modal-card {
      background: var(--c-pine);
      border: 1px solid var(--c-pine-border);
      border-radius: 16px;
      width: 90%;
      max-width: 440px;
      padding: 24px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
      position: relative;
    }

    .modal-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: none;
      border: none;
      color: var(--c-sand);
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }

    .modal-close:hover { color: #fff; }

    .modal-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 24px;
      color: var(--c-ivory);
      margin-bottom: 8px;
    }

    .modal-desc {
      font-size: 13px;
      color: var(--c-sand);
      line-height: 1.5;
      margin-bottom: 18px;
    }

    .qr-container {
      background: #fff;
      padding: 16px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      width: 200px;
      height: 200px;
    }

    .qr-container img {
      width: 100%;
      height: 100%;
      display: block;
    }

    .url-copy-box {
      display: flex;
      align-items: center;
      background: var(--c-forest);
      border: 1px solid var(--c-pine-border);
      border-radius: 8px;
      padding: 8px 12px;
      gap: 8px;
    }

    .url-text {
      flex: 1;
      font-family: monospace;
      font-size: 13px;
      color: var(--c-ivory);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* FLOATING CHECKLIST PILL / DRAWER */
    .checklist-drawer {
      position: absolute;
      right: 18px;
      bottom: 18px;
      background: var(--c-pine);
      border: 1px solid var(--c-pine-border);
      border-radius: 12px;
      padding: 12px 16px;
      max-width: 310px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      z-index: 40;
      transition: all 0.2s ease;
    }

    .checklist-drawer.collapsed .checklist-content {
      display: none;
    }

    .checklist-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      cursor: pointer;
    }

    .checklist-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--c-butter);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .checklist-toggle-btn {
      background: none;
      border: none;
      color: var(--c-sand);
      font-size: 11px;
      cursor: pointer;
    }

    .checklist-content {
      margin-top: 10px;
      font-size: 11px;
      color: var(--c-sand);
      line-height: 1.5;
    }

    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 6px;
    }

    .check-icon {
      color: var(--c-green);
      font-weight: bold;
    }
  </style>
</head>
<body>

  <!-- TOP TOOLBAR -->
  <header class="toolbar">
    <div class="brand-section">
      <div class="brand-emblem">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m8 3 4 8 5-5 5 15H2L8 3z"></path>
        </svg>
      </div>
      <div>
        <div class="brand-title">DEAR HILLS</div>
      </div>
      <div class="brand-badge">PORT ${PORT} READY</div>
    </div>

    <!-- CONTROLS -->
    <div class="controls-cluster">
      <!-- Target Environment Switcher -->
      <div class="control-group">
        <span class="control-label">Target:</span>
        <select id="target-select" onchange="switchTarget(this.value)">
          <option value="production" ${initialTarget === 'production' ? 'selected' : ''}>🌐 Production (dearhills.in)</option>
          <option value="local" ${initialTarget === 'local' ? 'selected' : ''}>💻 Local Dev (localhost:8787)</option>
        </select>
      </div>

      <!-- Device Preset Switcher -->
      <div class="control-group">
        <span class="control-label">Device:</span>
        <select id="device-select" onchange="changeDevice(this.value)">
          <option value="iphone-16-pro" selected>📱 iPhone 16 Pro (393 × 852)</option>
          <option value="iphone-15">📱 iPhone 15 / 14 (390 × 844)</option>
          <option value="iphone-se">📱 iPhone SE (375 × 667)</option>
          <option value="galaxy-s24">🤖 Galaxy S24 / Pixel 9 (412 × 915)</option>
          <option value="compact-android">📱 Compact Android (360 × 780)</option>
          <option value="ipad-mini">📟 iPad Mini (768 × 1024)</option>
        </select>
      </div>

      <!-- Orientation Toggle -->
      <button class="btn" id="btn-orientation" onclick="toggleOrientation()" title="Rotate portrait/landscape">
        🔄 <span id="orientation-text">Portrait</span>
      </button>

      <!-- Frame Toggle -->
      <button class="btn active" id="btn-frame" onclick="toggleFrame()" title="Toggle realistic phone bezel">
        🖼️ <span>Bezel</span>
      </button>

      <!-- Zoom / Scale -->
      <div class="control-group">
        <span class="control-label">Scale:</span>
        <select id="scale-select" onchange="changeScale(this.value)">
          <option value="auto" selected>Auto Fit</option>
          <option value="1">100%</option>
          <option value="0.9">90%</option>
          <option value="0.8">80%</option>
          <option value="0.75">75%</option>
        </select>
      </div>

      <!-- Reload button -->
      <button class="btn btn-icon" onclick="reloadIframe()" title="Reload Mobile Screen">
        🔄
      </button>

      <!-- Open Raw View -->
      <button class="btn" onclick="openDirectTab()" title="Open raw mobile viewport in new tab">
        ↗️ New Tab
      </button>

      <!-- Connect Physical Phone -->
      <button class="btn btn-primary" onclick="openModal()" title="Open QR Code & Wi-Fi URL for physical phones">
        📲 Test on Phone
      </button>
    </div>
  </header>

  <!-- SUB-BAR: ADDRESS & QUICK NAVIGATION -->
  <div class="subbar">
    <div class="address-bar">
      <button class="nav-arrow" onclick="historyBack()" title="Back">‹</button>
      <button class="nav-arrow" onclick="historyForward()" title="Forward">›</button>
      <div class="address-input-wrapper">
        <span class="address-lock">🔒</span>
        <input type="text" class="address-input" id="address-input" value="${cleanInitialPath}" onkeydown="handleAddressKey(event)" placeholder="e.g. /become-a-maker or /shop">
      </div>
      <button class="btn-go" onclick="navigateAddress()">Go</button>
    </div>

    <!-- Quick Navigation Routes -->
    <div class="quick-routes">
      <div class="route-chip active" onclick="quickNav('/', this)">🏠 Home</div>
      <div class="route-chip" onclick="quickNav('/shop', this)">🛍️ All Shop</div>
      <div class="route-chip" onclick="quickNav('/shop?category=honey-preserves', this)">🍯 Honey</div>
      <div class="route-chip" onclick="quickNav('/shop?category=shawls-handlooms', this)">🧣 Shawls</div>
      <div class="route-chip" onclick="quickNav('/shop?category=kangra-tea', this)">🍵 Kangra Tea</div>
      <div class="route-chip" onclick="quickNav('/become-a-maker', this)">🌿 Become a Maker</div>
      <div class="route-chip" onclick="quickNav('/cart', this)">🛒 Cart</div>
      <div class="route-chip" onclick="quickNav('/seller/orders', this)">📦 Seller Orders</div>
      <div class="route-chip" onclick="quickNav('/seller', this)">📊 Seller Studio</div>
      <div class="route-chip" onclick="quickNav('/admin/sellers', this)">🛡️ Admin Sellers</div>
      <div class="route-chip" onclick="quickNav('/admin/products', this)">🛡️ Admin Products</div>
    </div>
  </div>

  <!-- MAIN SIMULATOR STAGE -->
  <main class="stage" id="stage">
    <div class="simulator-wrapper" id="simulator-wrapper">
      <div class="phone-chassis" id="phone-chassis" style="width: 393px; height: 852px;">
        
        <!-- STATUS BAR -->
        <div class="phone-status-bar" id="status-bar">
          <div class="status-time" id="status-clock">9:41</div>
          <div class="dynamic-island" id="dynamic-island">
            <div class="camera-lens"></div>
          </div>
          <div class="status-icons">
            <span>5G</span>
            <svg width="14" height="12" viewBox="0 0 16 12" fill="currentColor">
              <path d="M0 2.5C2.8 0 7.2 0 10 2.5l-5 6-5-6zm2.5 2C4.1 3.2 6.9 3.2 8.5 4.5l-3.5 4.2-3.5-4.2z"></path>
            </svg>
            <svg width="18" height="10" viewBox="0 0 22 12" fill="currentColor">
              <rect x="0.5" y="0.5" width="18" height="11" rx="2.5" fill="none" stroke="currentColor"></rect>
              <rect x="2" y="2" width="15" height="8" rx="1.5"></rect>
              <path d="M20 4.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
            </svg>
          </div>
        </div>

        <!-- MOBILE SCREEN CONTAINER -->
        <div class="phone-screen">
          <iframe 
            id="mobile-iframe" 
            class="phone-iframe" 
            src="${cleanInitialPath}${cleanInitialPath.includes('?') ? '&' : '?'}__dh_inner=1" 
            loading="eager"
            title="Dear Hills Mobile Viewport">
          </iframe>
        </div>

        <!-- HOME INDICATOR -->
        <div class="home-indicator-bar" id="home-indicator">
          <div class="home-indicator-pill"></div>
        </div>

      </div>
    </div>

    <!-- FLOATING INFO PILL -->
    <div class="footer-pill">
      <span>Device: <strong id="info-device-name">iPhone 16 Pro</strong></span>
      <span>•</span>
      <span>Viewport: <strong id="info-viewport-size">393 × 852 px</strong></span>
      <span>•</span>
      <span>Applied Scale: <strong id="info-scale">Auto (85%)</strong></span>
      <span>•</span>
      <span>LAN: <strong style="color:var(--c-gold)">http://${LAN_IP}:${PORT}</strong></span>
    </div>

    <!-- FLOATING CHECKLIST DRAWER -->
    <div class="checklist-drawer" id="checklist-drawer">
      <div class="checklist-header" onclick="toggleChecklist()">
        <div class="checklist-title">
          <span>✨</span> Mobile Optimizations
        </div>
        <button class="checklist-toggle-btn" id="checklist-toggle-btn">Hide ▲</button>
      </div>
      <div class="checklist-content">
        <div class="checklist-item"><span class="check-icon">✓</span> 16px input font (zero iOS auto-zoom)</div>
        <div class="checklist-item"><span class="check-icon">✓</span> ≥44px touch targets on wishlist & CTA</div>
        <div class="checklist-item"><span class="check-icon">✓</span> Mobile bottom navigation for Seller Studio</div>
        <div class="checklist-item"><span class="check-icon">✓</span> Responsive order & inventory cards</div>
        <div class="checklist-item"><span class="check-icon">✓</span> Zero horizontal scroll overflow</div>
        <div class="checklist-item"><span class="check-icon">✓</span> Fast touch scrolling & drawer menus</div>
      </div>
    </div>
  </main>

  <!-- MODAL FOR PHYSICAL DEVICE CONNECT -->
  <div class="modal-overlay" id="qr-modal" onclick="closeModalOnBackdrop(event)">
    <div class="modal-card">
      <button class="modal-close" onclick="closeModal()">×</button>
      <h3 class="modal-title">Test on Physical Phone</h3>
      <p class="modal-desc">
        Connect your iPhone or Android phone to the same local Wi-Fi, then scan this QR code or enter the URL below into Safari / Chrome mobile:
      </p>
      <div class="qr-container">
        <img 
          src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=http%3A%2F%2F${LAN_IP}%3A${PORT}&color=10-25-24" 
          alt="QR Code to http://${LAN_IP}:${PORT}"
          onerror="this.parentElement.innerHTML='<div style=\\'color:#101918;text-align:center;padding:20px;font-size:12px;\\'>Open directly:<br><strong>http://${LAN_IP}:${PORT}</strong></div>'"
        />
      </div>
      <div class="url-copy-box">
        <span class="url-text" id="lan-url-text">http://${LAN_IP}:${PORT}</span>
        <button class="btn btn-primary" onclick="copyLanUrl()">Copy</button>
      </div>
    </div>
  </div>

  <script>
    const DEVICES = ${JSON.stringify(DEVICES)};
    let currentDeviceKey = 'iphone-16-pro';
    let isLandscape = false;
    let showFrame = true;
    let currentScaleMode = 'auto';

    const phoneChassis = document.getElementById('phone-chassis');
    const simulatorWrapper = document.getElementById('simulator-wrapper');
    const mobileIframe = document.getElementById('mobile-iframe');
    const addressInput = document.getElementById('address-input');
    const stage = document.getElementById('stage');
    const infoDeviceName = document.getElementById('info-device-name');
    const infoViewportSize = document.getElementById('info-viewport-size');
    const infoScale = document.getElementById('info-scale');

    // Live Clock in Status Bar
    function updateClock() {
      const now = new Date();
      let hours = now.getHours();
      const mins = String(now.getMinutes()).padStart(2, '0');
      const clockEl = document.getElementById('status-clock');
      if (clockEl) clockEl.textContent = hours + ':' + mins;
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Auto-Scale Calculator
    function calculateAndApplyScale() {
      if (currentScaleMode !== 'auto') {
        const fixed = parseFloat(currentScaleMode);
        simulatorWrapper.style.transform = 'scale(' + fixed + ')';
        infoScale.textContent = Math.round(fixed * 100) + '%';
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      const availWidth = stageRect.width - 48;
      const availHeight = stageRect.height - 48;

      const device = DEVICES[currentDeviceKey];
      let devW = isLandscape ? device.height : device.width;
      let devH = isLandscape ? device.width : device.height;

      // Add bezel thickness
      const totalW = showFrame ? devW + 24 : devW;
      const totalH = showFrame ? devH + 62 + 24 : devH;

      const scaleX = availWidth / totalW;
      const scaleY = availHeight / totalH;
      let scale = Math.min(1, scaleX, scaleY);

      // Clamp scale nicely
      scale = Math.max(0.4, Math.min(1, scale));
      simulatorWrapper.style.transform = 'scale(' + scale.toFixed(3) + ')';
      infoScale.textContent = 'Auto (' + Math.round(scale * 100) + '%)';
    }

    window.addEventListener('resize', calculateAndApplyScale);

    // Change Device
    function changeDevice(key) {
      currentDeviceKey = key;
      const device = DEVICES[key];
      const w = isLandscape ? device.height : device.width;
      const h = isLandscape ? device.width : device.height;

      phoneChassis.style.width = w + 'px';
      phoneChassis.style.height = h + 'px';
      phoneChassis.style.borderRadius = (device.radius || 48) + 'px';

      infoDeviceName.textContent = device.name;
      infoViewportSize.textContent = w + ' × ' + h + ' px';

      // Dynamic Island / Notch adjustment
      const island = document.getElementById('dynamic-island');
      if (device.frame === 'island') {
        island.style.display = 'flex';
        island.style.width = '110px';
        island.style.borderRadius = '20px';
      } else if (device.frame === 'punch') {
        island.style.display = 'flex';
        island.style.width = '24px';
        island.style.borderRadius = '50%';
      } else {
        island.style.display = 'none';
      }

      calculateAndApplyScale();
    }

    // Toggle Orientation
    function toggleOrientation() {
      isLandscape = !isLandscape;
      document.getElementById('orientation-text').textContent = isLandscape ? 'Landscape' : 'Portrait';
      changeDevice(currentDeviceKey);
    }

    // Toggle Bezel
    function toggleFrame() {
      showFrame = !showFrame;
      const btn = document.getElementById('btn-frame');
      if (showFrame) {
        phoneChassis.classList.remove('no-frame');
        btn.classList.add('active');
      } else {
        phoneChassis.classList.add('no-frame');
        btn.classList.remove('active');
      }
      calculateAndApplyScale();
    }

    // Change Scale
    function changeScale(val) {
      currentScaleMode = val;
      calculateAndApplyScale();
    }

    // Target Switcher (Production vs Local)
    function switchTarget(target) {
      document.cookie = 'dh_target=' + target + '; path=/; max-age=86400';
      const curPath = addressInput.value || '/';
      mobileIframe.src = curPath + (curPath.includes('?') ? '&' : '?') + '__dh_inner=1&t=' + Date.now();
    }

    // Address Bar navigation
    function navigateAddress() {
      let path = addressInput.value.trim();
      if (!path) path = '/';
      if (!path.startsWith('/')) path = '/' + path;
      addressInput.value = path;
      mobileIframe.contentWindow.postMessage({ type: 'DH_SIMULATOR_NAVIGATE', path: path }, '*');
      updateActiveRouteChip(path);
    }

    function handleAddressKey(e) {
      if (e.key === 'Enter') navigateAddress();
    }

    function quickNav(path, el) {
      addressInput.value = path;
      document.querySelectorAll('.route-chip').forEach(c => c.classList.remove('active'));
      if (el) el.classList.add('active');
      mobileIframe.contentWindow.postMessage({ type: 'DH_SIMULATOR_NAVIGATE', path: path }, '*');
    }

    function updateActiveRouteChip(path) {
      document.querySelectorAll('.route-chip').forEach(c => {
        const text = c.textContent;
        if (path === '/' && text.includes('Home')) c.classList.add('active');
        else if (path.startsWith('/become-a-maker') && text.includes('Maker')) c.classList.add('active');
        else if (path.startsWith('/shop') && !path.includes('?') && text.includes('All Shop')) c.classList.add('active');
        else if (path.includes('category=honey') && text.includes('Honey')) c.classList.add('active');
        else if (path.includes('category=shawls') && text.includes('Shawls')) c.classList.add('active');
        else if (path.includes('category=kangra') && text.includes('Tea')) c.classList.add('active');
        else if (path.startsWith('/cart') && text.includes('Cart')) c.classList.add('active');
        else if (path.startsWith('/seller/orders') && text.includes('Orders')) c.classList.add('active');
        else if (path.startsWith('/seller') && !path.startsWith('/seller/orders') && text.includes('Studio')) c.classList.add('active');
        else if (path.startsWith('/admin/sellers') && text.includes('Admin Sellers')) c.classList.add('active');
        else if (path.startsWith('/admin/products') && text.includes('Admin Products')) c.classList.add('active');
        else c.classList.remove('active');
      });
    }

    function reloadIframe() {
      mobileIframe.contentWindow.postMessage({ type: 'DH_SIMULATOR_RELOAD' }, '*');
    }

    function historyBack() {
      mobileIframe.contentWindow.postMessage({ type: 'DH_SIMULATOR_BACK' }, '*');
    }

    function historyForward() {
      mobileIframe.contentWindow.postMessage({ type: 'DH_SIMULATOR_FORWARD' }, '*');
    }

    function openDirectTab() {
      const path = addressInput.value || '/';
      window.open(path + (path.includes('?') ? '&' : '?') + 'raw=1', '_blank');
    }

    // Listen for route messages from inside the iframe
    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'DH_SIMULATOR_ROUTE') {
        const newPath = e.data.path;
        if (newPath) {
          addressInput.value = newPath;
          updateActiveRouteChip(newPath);
          try {
            window.history.replaceState(null, '', newPath);
          } catch (err) {}
        }
      }
    });

    // QR Modal Controls
    function openModal() {
      document.getElementById('qr-modal').classList.add('open');
    }

    function closeModal() {
      document.getElementById('qr-modal').classList.remove('open');
    }

    function closeModalOnBackdrop(e) {
      if (e.target.id === 'qr-modal') closeModal();
    }

    function copyLanUrl() {
      const text = document.getElementById('lan-url-text').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
      });
    }

    // Floating checklist toggle
    function toggleChecklist() {
      const drawer = document.getElementById('checklist-drawer');
      const btn = document.getElementById('checklist-toggle-btn');
      drawer.classList.toggle('collapsed');
      btn.textContent = drawer.classList.contains('collapsed') ? 'Show ▼' : 'Hide ▲';
    }

    // Initial setup
    changeDevice('iphone-16-pro');
  </script>
</body>
</html>`;
}

/**
 * Handle Reverse Proxy
 */
function handleProxy(req, res, targetOrigin) {
  const parsedReqUrl = new URL(req.url, 'http://localhost');
  const targetUrl = new URL(parsedReqUrl.pathname + parsedReqUrl.search, targetOrigin);

  const isHttps = targetUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  // Prepare outgoing headers
  const headers = { ...req.headers };
  headers.host = targetUrl.host;
  
  // Forward mobile User Agent if client requested simulator app view or mobile
  if (!isMobileUserAgent(headers['user-agent'])) {
    headers['user-agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  }

  // Ensure accept-encoding uses formats we can decompress cleanly
  if (headers['accept-encoding']) {
    headers['accept-encoding'] = 'gzip, deflate, br';
  }

  // Remove hop-by-hop headers
  delete headers['connection'];
  delete headers['keep-alive'];
  delete headers['transfer-encoding'];

  const proxyReq = transport.request(targetUrl, {
    method: req.method,
    headers: headers,
    rejectUnauthorized: false
  }, (proxyRes) => {
    // Process response headers
    const resHeaders = { ...proxyRes.headers };

    // Strip frame and security restrictions so iframe renders smoothly
    for (const key of Object.keys(resHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'x-frame-options' || lower.startsWith('content-security-policy')) {
        delete resHeaders[key];
      }
    }

    // Rewrite Location redirect headers to remain within preview proxy
    if (resHeaders['location']) {
      resHeaders['location'] = resHeaders['location']
        .replace(/^https?:\/\/(www\.)?dearhills\.in/i, '');
      if (!resHeaders['location'].startsWith('http') && !resHeaders['location'].startsWith('/')) {
        resHeaders['location'] = '/' + resHeaders['location'];
      }
    }

    // Rewrite Set-Cookie to work over plain HTTP on localhost/LAN IP
    if (resHeaders['set-cookie']) {
      if (Array.isArray(resHeaders['set-cookie'])) {
        resHeaders['set-cookie'] = resHeaders['set-cookie'].map(cookieStr => {
          return cookieStr
            .replace(/;\s*Secure/gi, '')
            .replace(/;\s*Domain=[^;]+/gi, '')
            .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax');
        });
      } else if (typeof resHeaders['set-cookie'] === 'string') {
        resHeaders['set-cookie'] = resHeaders['set-cookie']
          .replace(/;\s*Secure/gi, '')
          .replace(/;\s*Domain=[^;]+/gi, '')
          .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax');
      }
    }

    const contentType = (resHeaders['content-type'] || '').toLowerCase();
    const isHtml = contentType.includes('text/html');

    // If HTML, intercept and inject communication helper
    if (isHtml) {
      const contentEncoding = (resHeaders['content-encoding'] || '').toLowerCase();
      let stream = proxyRes;
      let decompressed = false;

      if (contentEncoding === 'gzip') {
        stream = proxyRes.pipe(zlib.createGunzip());
        decompressed = true;
      } else if (contentEncoding === 'br') {
        stream = proxyRes.pipe(zlib.createBrotliDecompress());
        decompressed = true;
      } else if (contentEncoding === 'deflate') {
        stream = proxyRes.pipe(zlib.createInflate());
        decompressed = true;
      } else if (contentEncoding === 'zstd' && typeof zlib.createZstdDecompress === 'function') {
        stream = proxyRes.pipe(zlib.createZstdDecompress());
        decompressed = true;
      } else if (!contentEncoding || contentEncoding === 'identity') {
        decompressed = true;
      }

      if (decompressed) {
        delete resHeaders['content-encoding'];
        delete resHeaders['content-length'];
      }

      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        let html;
        if (decompressed) {
          html = Buffer.concat(chunks).toString('utf8');
        } else {
          // If we couldn't decompress, try zstdDecompressSync as fallback
          try {
            if (typeof zlib.zstdDecompressSync === 'function') {
              html = zlib.zstdDecompressSync(Buffer.concat(chunks)).toString('utf8');
              delete resHeaders['content-encoding'];
              delete resHeaders['content-length'];
            } else {
              html = Buffer.concat(chunks).toString('utf8');
            }
          } catch {
            html = Buffer.concat(chunks).toString('utf8');
          }
        }

        // Inject helper script before closing </body> or at the end
        if (html.includes('</body>')) {
          html = html.replace('</body>', INJECTED_HELPER_SCRIPT + '</body>');
        } else {
          html += INJECTED_HELPER_SCRIPT;
        }

        res.writeHead(proxyRes.statusCode || 200, resHeaders);
        res.end(html);
      });

      stream.on('error', (err) => {
        console.error('[Preview Proxy HTML Error]:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/plain' });
          res.end('Proxy decomp error: ' + err.message);
        }
      });
      return;
    }

    // Non-HTML streaming (JS, CSS, images, JSON, media)
    res.writeHead(proxyRes.statusCode || 200, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Preview Proxy Connection Error to ${targetUrl.href}]:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`
        <div style="font-family:sans-serif;padding:30px;background:#172321;color:#F7F1E7;border-radius:12px;margin:20px;">
          <h2>Preview Proxy Error</h2>
          <p>Could not connect to target: <code>${targetUrl.origin}</code></p>
          <p style="color:#D98263;">${err.message}</p>
          <p style="font-size:12px;opacity:0.8;">Ensure target server is running or switch to production.</p>
        </div>
      `);
    }
  });

  // Pipe request body if POST/PUT/etc.
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

/**
 * Main HTTP Server
 */
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;
  const cookies = parseCookies(req.headers['cookie']);
  const ua = req.headers['user-agent'] || '';

  // Determine Upstream Target (default to Production dearhills.in)
  let targetOrigin = DEFAULT_TARGET;
  if (parsedUrl.searchParams.get('target') === 'local' || cookies['dh_target'] === 'local') {
    targetOrigin = LOCAL_TARGET;
  }

  // Health check endpoint
  if (pathname === '/_preview_health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      port: PORT,
      lanIp: LAN_IP,
      target: targetOrigin,
      time: new Date().toISOString()
    }));
    return;
  }

  // Check if this request is explicitly an APP request (inside simulator iframe, or direct mobile request)
  const isExplicitApp = 
    parsedUrl.searchParams.get('__dh_inner') === '1' ||
    parsedUrl.searchParams.get('raw') === '1';
  const isIframe = req.headers['sec-fetch-dest'] === 'iframe';
  const isMobile = isMobileUserAgent(ua) && parsedUrl.searchParams.get('simulator') !== '1';
  
  // Static assets or API calls should ALWAYS be proxied directly
  const isStaticOrApi = 
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/uploads/') ||
    pathname.startsWith('/mock/') ||
    /\.(js|css|json|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|map)$/i.test(pathname);

  if (isExplicitApp || isIframe || isMobile || isStaticOrApi) {
    // Forward to Target Web Application
    handleProxy(req, res, targetOrigin);
    return;
  }

  // Otherwise, Desktop browser visiting a route: serve the Mobile Device Simulator Shell!
  const html = renderSimulatorShell({
    initialPath: pathname + (parsedUrl.search ? parsedUrl.search : ''),
    initialTarget: targetOrigin === LOCAL_TARGET ? 'local' : 'production'
  });

  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache, no-store, must-revalidate'
  });
  res.end(html);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=============================================================`);
  console.log(`🏔️  DEAR HILLS — MOBILE INTERFACE SIMULATOR SERVER IS READY`);
  console.log(`=============================================================`);
  console.log(`📱 Local Desktop Simulator:   http://localhost:${PORT}`);
  console.log(`📲 Local LAN (Phone Wi-Fi):    http://${LAN_IP}:${PORT}`);
  console.log(`🌐 Target Upstream:           ${DEFAULT_TARGET}`);
  console.log(`💻 Local Dev Target:          ${LOCAL_TARGET}`);
  console.log(`=============================================================\n`);
});
