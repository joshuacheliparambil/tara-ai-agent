import "dotenv/config";
import express from "express";
import { askTara } from "./agent.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Tara AI Finance Research</title>
        <style>
          :root {
            color-scheme: light;
            --ink: #1d1633;
            --muted: #746b8f;
            --line: #ded6f2;
            --panel: rgba(255, 255, 255, 0.82);
            --panel-solid: #ffffff;
            --bg: #f8f5ff;
            --lavender: #8b5cf6;
            --lavender-deep: #6d3fe3;
            --lavender-soft: #efe8ff;
            --violet-ink: #3e2d7a;
            --success: #16a34a;
            --blue: #2563eb;
            --shadow: 0 18px 48px rgba(82, 49, 145, 0.10);
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            min-height: 100vh;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: linear-gradient(135deg, #ffffff 0%, #fbf9ff 48%, #f3edff 100%);
            color: var(--ink);
          }

          button,
          input {
            font: inherit;
          }

          .app {
            min-height: 100vh;
            display: grid;
            grid-template-columns: 254px minmax(0, 1fr) 340px;
            gap: 24px;
            padding: 0;
          }

          .sidebar,
          .right-rail,
          .chat-card,
          .insight-card {
            background: var(--panel);
            border: 1px solid rgba(139, 92, 246, 0.18);
            box-shadow: var(--shadow);
            backdrop-filter: blur(18px);
          }

          .sidebar {
            border-radius: 0;
            padding: 22px;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            background: linear-gradient(180deg, #f2eaff 0%, #ffffff 82%);
            border-top: 0;
            border-bottom: 0;
            border-left: 0;
          }

          .brand-row {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 26px;
          }

          .logo,
          .avatar,
          .mini-logo {
            display: grid;
            place-items: center;
            color: #fff;
            background:
              radial-gradient(circle at 35% 24%, #ffffff 0 8%, transparent 9%),
              linear-gradient(135deg, #b794ff 0%, #7c3aed 45%, #4c1d95 100%);
            box-shadow: 0 12px 34px rgba(109, 63, 227, 0.28);
          }

          .logo {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            font-weight: 900;
            font-size: 22px;
          }

          .brand-title {
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: 0;
          }

          .brand-subtitle {
            margin: 2px 0 0;
            color: var(--muted);
            font-size: 13px;
          }

          .new-chat {
            width: 100%;
            border: 1px solid rgba(139, 92, 246, 0.36);
            background: linear-gradient(135deg, #ffffff, #f4efff);
            color: var(--violet-ink);
            border-radius: 14px;
            min-height: 48px;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 14px;
            cursor: pointer;
            font-weight: 750;
            margin-bottom: 24px;
          }

          .nav {
            display: grid;
            gap: 8px;
          }

          .nav-item {
            width: 100%;
            border: 0;
            background: transparent;
            display: flex;
            align-items: center;
            gap: 11px;
            color: #50476a;
            min-height: 38px;
            padding: 0 10px;
            border-radius: 12px;
            font-size: 14px;
            cursor: pointer;
            text-align: left;
          }

          .nav-item.active {
            background: var(--lavender-soft);
            color: var(--lavender-deep);
            font-weight: 760;
          }

          .nav-item:hover {
            background: rgba(139, 92, 246, 0.10);
            color: var(--lavender-deep);
          }

          .icon {
            width: 18px;
            height: 18px;
            display: inline-grid;
            place-items: center;
            border-radius: 6px;
            color: currentColor;
          }

          .recent {
            margin-top: 30px;
          }

          .section-title {
            margin: 0 0 12px;
            color: #6b6281;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: .08em;
          }

          .recent button {
            width: 100%;
            border: 0;
            background: transparent;
            color: var(--muted);
            text-align: left;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 10px;
            padding: 8px 0;
            cursor: pointer;
            font-size: 13px;
          }

          .recent button span:first-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .profile {
            margin-top: auto;
            border-top: 1px solid var(--line);
            padding-top: 18px;
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .profile-badge {
            width: 42px;
            height: 42px;
            border-radius: 14px;
            display: grid;
            place-items: center;
            background: #e8efff;
            color: #3450a3;
            font-weight: 800;
          }

          .profile strong {
            display: block;
            font-size: 14px;
          }

          .profile span {
            color: var(--muted);
            font-size: 12px;
          }

          .main {
            display: grid;
            gap: 18px;
            min-width: 0;
          }

          .hero {
            min-height: 132px;
            border-radius: 0;
            padding: 36px 4px 6px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            overflow: hidden;
            position: relative;
            background: transparent;
            border: 0;
            box-shadow: none;
            backdrop-filter: none;
          }

          .hero::before {
            content: none;
          }

          .eyebrow {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--lavender-deep);
            background: var(--lavender-soft);
            border: 1px solid rgba(139, 92, 246, 0.22);
            border-radius: 999px;
            padding: 7px 10px;
            font-size: 12px;
            font-weight: 800;
            margin-bottom: 22px;
          }

          .hero h1 {
            margin: 0;
            font-size: clamp(30px, 3vw, 42px);
            line-height: 1.12;
            letter-spacing: 0;
          }

          .hero p {
            margin: 10px 0 0;
            max-width: 580px;
            color: var(--muted);
            font-size: 16px;
            line-height: 1.55;
          }

          .hero-visual {
            position: relative;
            display: flex;
            align-items: end;
            justify-content: center;
            min-height: 226px;
          }

          .avatar-halo {
            position: absolute;
            width: 260px;
            height: 260px;
            bottom: -46px;
            border-radius: 50%;
            background:
              radial-gradient(circle at 50% 35%, rgba(255, 255, 255, 0.9), transparent 30%),
              radial-gradient(circle, rgba(139, 92, 246, 0.32), rgba(139, 92, 246, 0.08) 58%, transparent 70%);
          }

          .avatar-card {
            position: relative;
            width: 174px;
            height: 202px;
            border-radius: 72px 72px 0 0;
            background:
              radial-gradient(circle at 50% 24%, #ffe8dc 0 23%, transparent 24%),
              radial-gradient(circle at 37% 21%, #2b173f 0 5%, transparent 6%),
              radial-gradient(circle at 63% 21%, #2b173f 0 5%, transparent 6%),
              radial-gradient(ellipse at 50% 54%, #221537 0 40%, transparent 41%),
              linear-gradient(135deg, #3d2d72, #20113f);
            border: 1px solid rgba(139, 92, 246, 0.28);
            box-shadow: 0 22px 54px rgba(61, 45, 114, 0.24);
          }

          .avatar-card::after {
            content: "";
            position: absolute;
            left: 38px;
            right: 38px;
            top: 65px;
            height: 12px;
            border-bottom: 3px solid #b05f72;
            border-radius: 50%;
          }

          .chat-card {
            border-radius: 14px;
            padding: 18px;
            min-height: 538px;
            display: grid;
            grid-template-rows: auto 1fr auto auto;
            gap: 14px;
          }

          .chat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 4px 4px 0;
          }

          .chat-header h2 {
            margin: 0;
            font-size: 18px;
            letter-spacing: 0;
          }

          .source-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #4c3b82;
            background: #f4efff;
            border: 1px solid var(--line);
            border-radius: 999px;
            padding: 7px 10px;
            font-size: 12px;
            font-weight: 760;
          }

          .active-context {
            color: var(--muted);
            font-size: 13px;
            font-weight: 650;
            margin-left: 8px;
          }

          .chat {
            min-height: 280px;
            max-height: 430px;
            overflow: auto;
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 10px 4px;
          }

          .message-row {
            display: flex;
            gap: 10px;
            align-items: flex-start;
          }

          .message-row.user-row {
            justify-content: flex-end;
          }

          .mini-logo {
            width: 34px;
            height: 34px;
            border-radius: 12px;
            flex: 0 0 auto;
            font-size: 14px;
            font-weight: 900;
          }

          .message {
            max-width: min(680px, 82%);
            border-radius: 18px;
            padding: 14px 16px;
            line-height: 1.52;
            font-size: 15px;
            white-space: pre-wrap;
            border: 1px solid transparent;
          }

          .user {
            color: #fff;
            background: linear-gradient(135deg, #8b5cf6, #6d3fe3);
            box-shadow: 0 14px 28px rgba(109, 63, 227, 0.20);
          }

          .tara {
            color: var(--ink);
            background: #ffffff;
            border-color: var(--line);
            box-shadow: 0 10px 28px rgba(82, 49, 145, 0.08);
          }

          .tool-note {
            margin-top: 12px;
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .tool-note span {
            color: #4c3b82;
            background: #f4efff;
            border: 1px solid #e4d9fb;
            border-radius: 999px;
            padding: 5px 8px;
            font-size: 12px;
            font-weight: 700;
          }

          .prompts {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
          }

          .prompt {
            border: 1px solid var(--line);
            background: rgba(255, 255, 255, 0.78);
            color: #4d4266;
            border-radius: 999px;
            padding: 9px 12px;
            cursor: pointer;
            font-size: 13px;
          }

          .prompt:hover {
            border-color: var(--lavender);
            color: var(--lavender-deep);
          }

          form {
            display: grid;
            grid-template-columns: 1fr 48px;
            gap: 10px;
            background: #ffffff;
            border: 1px solid var(--line);
            border-radius: 18px;
            padding: 8px;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
          }

          input {
            border: 0;
            min-height: 48px;
            padding: 0 12px;
            font-size: 15px;
            color: var(--ink);
            background: transparent;
            min-width: 0;
          }

          input:focus {
            outline: none;
          }

          button.ask {
            border: 0;
            border-radius: 14px;
            background: linear-gradient(135deg, #9b7cff, #6d3fe3);
            color: white;
            font-weight: 900;
            cursor: pointer;
            display: grid;
            place-items: center;
            box-shadow: 0 14px 28px rgba(109, 63, 227, 0.22);
          }

          button.ask:hover {
            background: linear-gradient(135deg, #8b5cf6, #5b2fd0);
          }

          button.ask:disabled {
            opacity: .65;
            cursor: wait;
          }

          .right-rail {
            border-radius: 0;
            padding: 138px 30px 20px 0;
            min-height: 100vh;
            display: grid;
            align-content: start;
            gap: 16px;
          }

          .stat-card {
            background: #ffffff;
            border: 1px solid var(--line);
            border-radius: 14px;
            padding: 18px;
            box-shadow: 0 12px 30px rgba(82, 49, 145, 0.08);
          }

          .stat-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: var(--muted);
            font-size: 13px;
            margin-bottom: 14px;
          }

          .stat-value {
            margin: 0;
            color: #4c1d95;
            font-size: 26px;
            font-weight: 850;
            letter-spacing: 0;
          }

          .stat-caption {
            margin: 7px 0 0;
            color: var(--muted);
            font-size: 13px;
          }

          .sparkline {
            width: 100%;
            height: 68px;
            margin-top: 14px;
          }

          .action {
            width: 100%;
            border: 1px solid var(--line);
            background: #fbfaff;
            color: var(--ink);
            border-radius: 14px;
            padding: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            font-weight: 720;
            margin-top: 8px;
          }

          .action:hover {
            border-color: var(--lavender);
            color: var(--lavender-deep);
          }

          .footer-strip {
            grid-column: 1 / -1;
            display: flex;
            justify-content: center;
            gap: 26px;
            color: var(--muted);
            font-size: 13px;
            padding: 0 0 4px;
          }

          .quick-insights h2 {
            margin: 0 0 12px;
            font-size: 18px;
            letter-spacing: 0;
          }

          .view-panel {
            background: #ffffff;
            border: 1px solid var(--line);
            border-radius: 14px;
            box-shadow: var(--shadow);
            padding: 22px;
          }

          .view-panel h2 {
            margin: 0 0 8px;
            font-size: 22px;
            letter-spacing: 0;
          }

          .view-panel p {
            color: var(--muted);
          }

          .view-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
            margin-top: 18px;
          }

          .view-tile {
            border: 1px solid var(--line);
            border-radius: 14px;
            background: linear-gradient(135deg, #ffffff, #faf7ff);
            padding: 16px;
          }

          .view-tile strong {
            display: block;
            margin-bottom: 8px;
            color: var(--violet-ink);
          }

          .view-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 18px;
          }

          .insight-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 22px;
          }

          .insight-card {
            border-radius: 14px;
            min-height: 150px;
            padding: 18px;
            background: #ffffff;
          }

          .insight-card.purple { background: linear-gradient(135deg, #ffffff, #f0e8ff); }
          .insight-card.pink { background: linear-gradient(135deg, #ffffff, #fff0f8); }
          .insight-card.green { background: linear-gradient(135deg, #ffffff, #eefbf4); }

          .insight-top {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
          }

          .insight-icon {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            display: grid;
            place-items: center;
            background: var(--lavender-soft);
            color: var(--lavender-deep);
            font-weight: 900;
          }

          .insight-label {
            margin: 0;
            color: #4c3b82;
            font-size: 13px;
            font-weight: 760;
          }

          .insight-value {
            margin: 0;
            font-size: 22px;
            font-weight: 850;
          }

          .bar {
            height: 6px;
            border-radius: 99px;
            background: #e6ddf8;
            overflow: hidden;
            margin-top: 16px;
          }

          .bar span {
            display: block;
            height: 100%;
            width: 62%;
            background: linear-gradient(90deg, #a78bfa, #7c3aed);
          }

          .footer-strip span {
            display: inline-flex;
            align-items: center;
            gap: 7px;
          }

          @media (max-width: 1180px) {
            .app {
              grid-template-columns: 250px minmax(0, 1fr);
            }
            .right-rail {
              display: none;
            }
            .insight-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .view-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 820px) {
            .app {
              grid-template-columns: 1fr;
              padding: 12px;
            }
            .sidebar {
              min-height: auto;
            }
            .nav,
            .recent,
            .profile {
              display: none;
            }
            .hero {
              grid-template-columns: 1fr;
              padding: 22px;
            }
            .hero-visual {
              display: none;
            }
            .chat-card {
              min-height: 560px;
            }
            .message {
              max-width: 92%;
            }
            .footer-strip {
              flex-wrap: wrap;
              gap: 12px;
            }
            .insight-grid {
              grid-template-columns: 1fr;
            }
            .view-grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <div class="app">
          <aside class="sidebar">
            <div class="brand-row">
              <div class="logo">✦</div>
              <div>
                <p class="brand-title">Tara AI</p>
                <p class="brand-subtitle">Finance Research Assistant</p>
              </div>
            </div>

            <button class="new-chat" type="button" id="newChat">＋ New Conversation</button>

            <nav class="nav" aria-label="Product sections">
              <button class="nav-item active" type="button" data-view="dashboard"><span class="icon">⌂</span> Dashboard</button>
              <button class="nav-item" type="button" data-view="conversations" data-question="What was my biggest expense?"><span class="icon">◌</span> Conversations</button>
              <button class="nav-item" type="button" data-view="insights" data-question="Which category had the biggest increase from February to March?"><span class="icon">↗</span> Insights</button>
              <button class="nav-item" type="button" data-view="transactions" data-question="What were my top 5 merchants by net spend between January and March 2025?"><span class="icon">▤</span> Transactions</button>
              <button class="nav-item" type="button" data-view="holdings" data-question="What is my portfolio worth today, and how much have I made on it in absolute INR?"><span class="icon">◇</span> Holdings</button>
              <button class="nav-item" type="button" data-view="funds" data-question="Rank all funds by one-year return between 2024-01-01 and 2025-01-01, and show the spread between best and worst."><span class="icon">◈</span> Mutual Funds</button>
            </nav>

            <div class="recent">
              <p class="section-title">Recent Conversations</p>
              <button type="button" class="recent-question"><span>What was my biggest expense?</span><span>2m</span></button>
              <button type="button" class="recent-question"><span>How much did I spend on food?</span><span>1h</span></button>
              <button type="button" class="recent-question"><span>Top 5 merchants by spending</span><span>3h</span></button>
              <button type="button" class="recent-question"><span>Portfolio performance</span><span>1d</span></button>
            </div>

            <div class="profile">
              <div class="profile-badge">JB</div>
              <div>
                <strong>Demo User</strong>
                <span>Local demo workspace</span>
              </div>
            </div>
          </aside>

          <main class="main" id="mainView">
            <section class="hero">
              <div>
                <h1>Hello there!</h1>
                <p>Ask me anything about your finances.</p>
              </div>
              <button class="new-chat" type="button" style="width: auto; margin: 0;">↺ History</button>
            </section>

            <section class="chat-card">
              <div class="chat-header">
                <h2>Ask Tara <span class="active-context" id="activeContext">Dashboard</span></h2>
                <span class="source-pill">Grounded by SQL tools</span>
              </div>

              <div class="chat" id="chat">
                <div class="message-row">
                  <div class="mini-logo">✦</div>
                  <div class="message tara">
                    I am Tara, your AI finance research analyst. Ask a question and I will use database-backed tools to answer with grounded numbers.
                    <div class="tool-note"><span>transactions</span><span>fund_navs</span><span>holdings</span></div>
                  </div>
                </div>
              </div>

              <div class="prompts">
                <button class="prompt" type="button" data-question="What were my top 5 merchants by net spend between January and March 2025?">💰 Top 5 expenses</button>
                <button class="prompt" type="button" data-question="How much did I spend on food in March 2025 after refunds?">🍽️ Food spending last month</button>
                <button class="prompt" type="button" data-question="Rank all funds by one-year return between 2024-01-01 and 2025-01-01, and show the spread between best and worst.">📈 Investment returns</button>
                <button class="prompt" type="button" data-question="Which transactions look like recurring subscriptions?">＋ More suggestions</button>
              </div>

              <form id="askForm">
                <input id="question" name="question" autocomplete="off" placeholder="Ask Tara anything about your finances..." />
                <button class="ask" id="askButton" type="submit" title="Send question">➤</button>
              </form>
            </section>

            <section class="quick-insights">
              <h2>Quick Insights</h2>
              <div class="insight-grid">
                <article class="insight-card purple">
                  <div class="insight-top"><div class="insight-icon">▣</div><p class="insight-label">Top Category</p></div>
                  <p class="insight-value">Food & Dining</p>
                  <p class="stat-caption">41.2% of tracked spending</p>
                  <div class="bar"><span></span></div>
                </article>
                <article class="insight-card pink">
                  <div class="insight-top"><div class="insight-icon">↗</div><p class="insight-label">Investment Return</p></div>
                  <p class="insight-value">12.45%</p>
                  <p class="stat-caption">Overall returns from holdings</p>
                </article>
                <article class="insight-card green">
                  <div class="insight-top"><div class="insight-icon">↕</div><p class="insight-label">Net Cash Flow</p></div>
                  <p class="insight-value">₹79,769.25</p>
                  <p class="stat-caption">Income minus expenses</p>
                </article>
                <article class="insight-card purple">
                  <div class="insight-top"><div class="insight-icon">◔</div><p class="insight-label">Asset Allocation</p></div>
                  <p class="insight-value">62% Equity</p>
                  <p class="stat-caption">Debt 25%, Others 13%</p>
                </article>
              </div>
            </section>
          </main>

          <aside class="right-rail">
            <section class="stat-card">
              <div class="stat-top"><span>Financial Snapshot</span><strong>Jun 2026</strong></div>
              <p class="stat-value">₹12,45,678.90</p>
              <p class="stat-caption">Total net worth estimate</p>
              <svg class="sparkline" viewBox="0 0 260 68" role="img" aria-label="spending trend">
                <path d="M4 52 C24 40, 31 60, 49 42 S78 50, 94 34 S125 43, 141 30 S170 38, 187 22 S218 30, 256 8" fill="none" stroke="#8b5cf6" stroke-width="4" stroke-linecap="round" />
                <path d="M4 66 L4 52 C24 40, 31 60, 49 42 S78 50, 94 34 S125 43, 141 30 S170 38, 187 22 S218 30, 256 8 L256 66 Z" fill="rgba(139,92,246,.12)" />
              </svg>
            </section>

            <section class="stat-card">
              <div class="stat-top"><span>Total Investments</span><strong>▲ 8.45%</strong></div>
              <p class="stat-value">₹8,75,430.50</p>
              <p class="stat-caption">Portfolio performance from NAVs</p>
              <svg class="sparkline" viewBox="0 0 260 68" role="img" aria-label="portfolio trend">
                <path d="M4 55 C24 48, 32 56, 48 44 S75 48, 91 35 S122 43, 140 30 S169 35, 184 20 S220 28, 256 10" fill="none" stroke="#2563eb" stroke-width="4" stroke-linecap="round" />
                <path d="M4 66 L4 55 C24 48, 32 56, 48 44 S75 48, 91 35 S122 43, 140 30 S169 35, 184 20 S220 28, 256 10 L256 66 Z" fill="rgba(37,99,235,.10)" />
              </svg>
            </section>

            <section class="stat-card">
              <div class="stat-top"><span>Total Spent</span><strong>May 2025</strong></div>
              <p class="stat-value">₹45,230.75</p>
              <p class="stat-caption">▲ 12.32% vs prior month</p>
            </section>

            <section class="stat-card">
              <div class="stat-top"><span>Total Income</span><strong>May 2025</strong></div>
              <p class="stat-value">₹1,25,000.00</p>
              <p class="stat-caption">▲ 5.20% vs prior month</p>
            </section>
          </aside>

          <div class="footer-strip">
            <span>🔒 Data stays local</span>
            <span>▣ Powered by PostgreSQL</span>
            <span>⚙ Built with Mastra-ready tools</span>
          </div>
        </div>

        <script>
          const chat = document.querySelector("#chat");
          const form = document.querySelector("#askForm");
          const input = document.querySelector("#question");
          const button = document.querySelector("#askButton");

          function addMessage(text, role) {
            const row = document.createElement("div");
            row.className = "message-row " + (role === "user" ? "user-row" : "");

            if (role !== "user") {
              const avatar = document.createElement("div");
              avatar.className = "mini-logo";
              avatar.textContent = "✦";
              row.appendChild(avatar);
            }

            const el = document.createElement("div");
            el.className = "message " + role;
            el.textContent = text;
            row.appendChild(el);
            chat.appendChild(row);
            chat.scrollTop = chat.scrollHeight;
            return el;
          }

          async function ask(question) {
            addMessage(question, "user");
            const pending = addMessage("Thinking through the right finance tool...", "tara");
            button.disabled = true;
            try {
              const response = await fetch("/ask", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ question })
              });
              const data = await response.json();
              pending.textContent = data.answer || "No answer returned.";
            } catch (error) {
              pending.textContent = "I could not reach the local Tara API. Check that the server is still running.";
            } finally {
              button.disabled = false;
              input.focus();
            }
          }

          form.addEventListener("submit", (event) => {
            event.preventDefault();
            const question = input.value.trim();
            if (!question) return;
            input.value = "";
            ask(question);
          });

          document.querySelectorAll(".prompt, .recent-question, .action").forEach((example) => {
            example.addEventListener("click", () => {
              const question = example.dataset.question || example.textContent.replace("›", "").trim();
              input.value = question;
              form.requestSubmit();
            });
          });

          document.querySelectorAll(".nav-item").forEach((item) => {
            item.addEventListener("click", () => {
              document.querySelectorAll(".nav-item").forEach((nav) => nav.classList.remove("active"));
              item.classList.add("active");

              const label = item.textContent.trim();
              const context = document.querySelector("#activeContext");
              if (context) context.textContent = label;

              if (item.dataset.view === "dashboard") {
                addMessage("Dashboard selected. Use the finance cards, quick insights, or prompt buttons to ask Tara a dataset-backed question.", "tara");
                return;
              }

              if (item.dataset.question) {
                input.value = item.dataset.question;
                form.requestSubmit();
              }
            });
          });

          document.querySelector("#newChat").addEventListener("click", () => {
            chat.innerHTML = '<div class="message-row"><div class="mini-logo">✦</div><div class="message tara">New conversation started. Ask me a finance question grounded in your database.</div></div>';
            input.focus();
          });
        </script>
      </body>
    </html>
  `);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "tara-ai-agent" });
});

app.get("/ask", (_req, res) => {
  res.type("html").send(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Tara /ask</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 760px; margin: 48px auto; padding: 0 20px; line-height: 1.5; color: #1d1633; background: #f8f5ff; }
          code, pre { background: #efe8ff; border-radius: 8px; }
          code { padding: 2px 5px; }
          pre { padding: 16px; overflow-x: auto; }
          a { color: #6d3fe3; }
        </style>
      </head>
      <body>
        <h1>Tara /ask is a POST endpoint</h1>
        <p>This route is working, but browser navigation sends a GET request. Use the chat UI at <a href="/">/</a>, PowerShell, curl, Postman, or the eval script.</p>
        <pre><code>Invoke-RestMethod -Uri "http://localhost:3000/ask" -Method POST -ContentType "application/json" -Body '{"question":"What was my biggest expense?"}'</code></pre>
        <p>Health check: <a href="/health">/health</a></p>
      </body>
    </html>
  `);
});

app.post("/ask", async (req, res) => {
  const question = req.body?.question;
  if (typeof question !== "string" || question.trim().length === 0) {
    res.status(400).json({ answer: "Request body must include a non-empty question string." });
    return;
  }
  const response = await askTara(question.trim());
  res.json({ answer: response.answer });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Tara AI Agent listening on http://localhost:${port}`);
});
