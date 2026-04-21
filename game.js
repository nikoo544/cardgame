// Nexus Quest: Open World RPG - Logic Engine

const TILE_TYPES = ['grass', 'grass', 'forest', 'forest', 'mountain', 'village', 'dungeon'];
const EVENTS = [
    { type: 'TREASURE', msg: '¡Encuentras un cofre antiguo!', reward: { gold: 20, xp: 5 } },
    { type: 'COMBAT', msg: '¡Un trasgo te embosca!', damage: 15, reward: { xp: 10, gold: 5 } },
    { type: 'MERCHANT', msg: 'Un mercader te ofrece provisiones.', cost: 10, reward: { hp: 20 } },
    { type: 'REST', msg: 'Un lugar tranquilo para descansar.', reward: { hp: 10 } }
];

class QuestGame {
    constructor() {
        this.map = [];
        this.localPlayer = {
            name: 'Héroe',
            icon: '⚔️',
            hp: 100,
            gold: 50,
            xp: 0,
            pos: 210 // Start near bottom
        };
        this.remotePlayer = null;
        this.turn = 1;
        this.localPlayerNum = 1;
        this.isMoving = false;

        this.initWelcome();
        this.initUI();
        this.generateMap();
        this.initPeer();
    }

    initWelcome() {
        const startBtn = document.getElementById('start-game-btn');
        const iconBtns = document.querySelectorAll('.icon-btn');
        
        iconBtns.forEach(btn => {
            btn.onclick = () => {
                iconBtns.forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.localPlayer.icon = btn.dataset.icon;
            };
        });

        startBtn.onclick = () => {
            const name = document.getElementById('player-name').value;
            if (name) this.localPlayer.name = name;
            document.getElementById('welcome-screen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            this.updatePlayerDisplay();
            this.sendState();
        };
    }

    generateMap() {
        for (let i = 0; i < 225; i++) {
            const type = TILE_TYPES[Math.floor(Math.random() * TILE_TYPES.length)];
            const hasEvent = Math.random() < 0.15;
            this.map[i] = { type, event: hasEvent ? Math.floor(Math.random() * EVENTS.length) : null, explored: false };
        }
        this.revealSurroundings(this.localPlayer.pos);
    }

    initUI() {
        this.ui = {
            map: document.getElementById('map'),
            log: document.getElementById('battle-log'),
            status: document.getElementById('status'),
            copyBtn: document.getElementById('copy-btn'),
            eventContent: document.getElementById('event-content'),
            eventChoices: document.getElementById('event-choices'),
            hp: document.getElementById('hero-hp'),
            gold: document.getElementById('hero-gold'),
            xp: document.getElementById('hero-xp'),
            nameDisplay: document.getElementById('hero-name-display'),
            iconDisplay: document.getElementById('hero-icon-display'),
            turnDisplay: document.getElementById('current-player-name')
        };

        this.renderMap();
        this.ui.copyBtn.onclick = () => this.copyLink();
    }

    renderMap() {
        this.ui.map.innerHTML = '';
        for (let i = 0; i < 225; i++) {
            const tile = document.createElement('div');
            const mapTile = this.map[i];
            tile.className = `tile ${mapTile.type} ${mapTile.explored ? 'explored' : ''}`;
            tile.dataset.index = i;

            if (this.localPlayer.pos === i) {
                const token = document.createElement('div');
                token.className = 'player-token';
                token.innerText = this.localPlayer.icon;
                tile.appendChild(token);
            }

            if (this.remotePlayer && this.remotePlayer.pos === i) {
                const token = document.createElement('div');
                token.className = 'player-token remote';
                token.innerText = this.remotePlayer.icon;
                tile.appendChild(token);
            }

            tile.onclick = () => this.handleMove(i);
            this.ui.map.appendChild(tile);
        }
    }

    handleMove(index) {
        if (this.turn !== this.localPlayerNum) return;
        
        const dist = this.getDist(this.localPlayer.pos, index);
        if (dist > 0 && dist <= 2) { // Max move 2
            this.localPlayer.pos = index;
            this.checkEvent(index);
            this.endTurn();
            this.sendState();
            this.renderMap();
        }
    }

    getDist(i1, i2) {
        const r1 = Math.floor(i1 / 15), c1 = i1 % 15;
        const r2 = Math.floor(i2 / 15), c2 = i2 % 15;
        return Math.abs(r1 - r2) + Math.abs(c1 - c2);
    }

    checkEvent(index) {
        const tile = this.map[index];
        tile.explored = true; // Clear Fog of War
        this.revealSurroundings(index);

        if (tile.event !== null) {
            const event = EVENTS[tile.event];
            
            if (event.type === 'COMBAT') {
                this.startCombatEvent(event);
            } else {
                this.applyEvent(event);
            }
            tile.event = null;
        } else {
            this.ui.eventContent.innerText = "El camino está despejado.";
        }
    }

    revealSurroundings(index) {
        const r = Math.floor(index / 15), c = index % 15;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const ni = (r + dr) * 15 + (c + dc);
                if (ni >= 0 && ni < 225) this.map[ni].explored = true;
            }
        }
    }

    startCombatEvent(event) {
        this.ui.eventContent.innerHTML = `<strong>${event.msg}</strong><br>¡Prepara tu dado!`;
        const rollBtn = document.createElement('button');
        rollBtn.className = 'action-btn';
        rollBtn.innerText = 'LANZAR d20';
        rollBtn.onclick = () => {
            const roll = Math.floor(Math.random() * 20) + 1;
            const damage = Math.max(0, event.damage - Math.floor(roll/2));
            this.localPlayer.hp -= damage;
            this.localPlayer.xp += event.reward.xp;
            this.log(`Sacaste un ${roll}. Recibes ${damage} de daño. +${event.reward.xp} XP.`);
            this.updatePlayerDisplay();
            rollBtn.remove();
            this.ui.eventContent.innerText = "Combate finalizado.";
        };
        this.ui.eventChoices.appendChild(rollBtn);
    }

    applyEvent(event) {
        this.ui.eventContent.innerText = event.msg;
        this.log(`Evento: ${event.msg}`);
        if (event.reward) {
            if (event.reward.gold) this.localPlayer.gold += event.reward.gold;
            if (event.reward.xp) this.localPlayer.xp += event.reward.xp;
            if (event.reward.hp) this.localPlayer.hp = Math.min(100, this.localPlayer.hp + event.reward.hp);
        }
        this.updatePlayerDisplay();
    }

    updatePlayerDisplay() {
        this.ui.hp.innerText = this.localPlayer.hp;
        this.ui.gold.innerText = this.localPlayer.gold;
        this.ui.xp.innerText = this.localPlayer.xp;
        this.ui.nameDisplay.innerText = this.localPlayer.name;
        this.ui.iconDisplay.innerText = this.localPlayer.icon;
    }

    endTurn() {
        this.turn = this.turn === 1 ? 2 : 1;
        this.updateTurnDisplay();
    }

    updateTurnDisplay() {
        const name = (this.turn === this.localPlayerNum) ? "TI" : (this.remotePlayer ? this.remotePlayer.name : "Oponente");
        this.ui.turnDisplay.innerText = name;
    }

    log(msg) {
        const p = document.createElement('div');
        p.innerText = `> ${msg}`;
        this.ui.log.prepend(p);
    }

    // --- PeerJS ---

    initPeer() {
        const params = new URLSearchParams(window.location.search);
        const joinId = params.get('join');
        const welcomeStatus = document.getElementById('welcome-status');
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            const msg = joinId ? `Conectando...` : `SALA: ${id}`;
            this.ui.status.innerText = msg;
            if(welcomeStatus) welcomeStatus.innerText = msg;
            if (!joinId) {
                this.log('Mundo creado. Esperando viajero...');
            } else {
                this.localPlayerNum = 2;
                this.localPlayer.pos = 14; 
                this.connect(joinId);
            }
        });

        this.peer.on('error', (err) => {
            console.error(err);
            this.ui.status.innerText = "Error de conexión";
            if(welcomeStatus) welcomeStatus.innerText = "Error. Recarga la página.";
        });

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
        });
    }

    connect(id) {
        this.conn = this.peer.connect(id);
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.ui.status.innerText = 'ONLINE';
            this.log('¡Compañero encontrado! La aventura comienza.');
            this.sendState();
        });
        this.conn.on('data', (data) => {
            if (data.type === 'SYNC') {
                this.remotePlayer = data.player;
                this.map = data.map || this.map;
                this.turn = data.turn;
                this.renderMap();
                this.updateTurnDisplay();
            }
        });
    }

    sendState() {
        if (this.conn) {
            this.send('SYNC', { 
                player: this.localPlayer, 
                map: this.map, 
                turn: this.turn 
            });
        }
    }

    send(type, value) {
        if (this.conn) this.conn.send({ type, ...value });
    }

    copyLink() {
        const url = `${window.location.origin}${window.location.pathname}?join=${this.peer.id}`;
        navigator.clipboard.writeText(url).then(() => {
            this.ui.copyBtn.innerText = '¡COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = 'INVITAR COMPAÑERO', 2000);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new QuestGame();
});
