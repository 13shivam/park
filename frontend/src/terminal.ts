import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const WS_BASE = 'ws://localhost:3000';

export class TerminalInstance {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private ws: WebSocket | null = null;
  private sessionId: string;
  private container: HTMLElement;

  constructor(sessionId: string, container: HTMLElement) {
    this.sessionId = sessionId;
    this.container = container;

    this.terminal = new Terminal({
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: '#3e3e42',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5'
      },
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      scrollback: 10000
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon());

    this.terminal.open(container);
    this.fitAddon.fit();

    // Handle resize
    window.addEventListener('resize', () => this.fit());

    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(`${WS_BASE}/terminal/${this.sessionId}`);

    this.ws.onopen = () => {
      console.log(`[Terminal] Connected to session ${this.sessionId}`);
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'history':
          this.terminal.write(message.data);
          break;
        case 'output':
          this.terminal.write(message.data);
          break;
        case 'exit':
          this.terminal.write(`\r\n\x1b[33m[Process exited with code ${message.code}]\x1b[0m\r\n`);
          break;
        case 'error':
          this.terminal.write(`\r\n\x1b[31m[Error: ${message.message}]\x1b[0m\r\n`);
          break;
      }
    };

    this.ws.onerror = (error) => {
      console.error('[Terminal] WebSocket error:', error);
      this.terminal.write('\r\n\x1b[31m[Connection error]\x1b[0m\r\n');
    };

    this.ws.onclose = () => {
      console.log(`[Terminal] Disconnected from session ${this.sessionId}`);
    };

    // Send input to backend
    this.terminal.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'input', data }));
      }
    });
  }

  fit(): void {
    this.fitAddon.fit();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'resize',
        cols: this.terminal.cols,
        rows: this.terminal.rows
      }));
    }
  }

  dispose(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.terminal.dispose();
  }

  focus(): void {
    this.terminal.focus();
  }
}
