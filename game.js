// Elemental Nexus: Multivac's Gambit - Logic Engine
// Using PeerJS for P2P connection

const ELEMENTS = ['FIRE', 'WATER', 'EARTH', 'AIR', 'VOID'];
const CARD_TYPES = ['ATTACK', 'EFFECT', 'HEAL'];

const CARD_POOL = [
    { name: 'Overclock Strike', type: 'ATTACK', element: 'FIRE', value: 10, desc: 'Damage * Roll/2' },
    { name: 'Binary Shield', type: 'EFFECT', element: 'VOID', value: 5, desc: 'Reduce next damage' },
    { name: 'Packet Leak', type: 'HEAL', element: 'WATER', value: 15, desc: 'Heal core' },
    { name: 'Logic Bomb', type: 'ATTACK', element: 'AIR', value: 20, desc: 'High risk roll' },
    { name: 'Data Corruption', type: 'EFFECT', element: 'EARTH', value: 8, desc: 'Reduce opponent roll' }
];

class GameManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.gameState = {
            turn: 0,
            currentPlayer: null,
            players: {
                local: { hp: 100, hand: [], element: 'NEUTRAL' },
                remote: { hp: 100, hand: [], element: 'VOID' }
            }
        };

        this.initElements();
        this.initPeer();
    }

    initElements() {
        this.ui = {
            log: document.getElementById('battle-log'),
            playerHP: document.querySelector('#player-monster .hp-fill'),
            opponentHP: document.querySelector('#opponent-monster .hp-fill'),
            playerHand: document.getElementById('player-hand'),
            opponentHand: document.getElementById('opponent-hand'),
            die: document.getElementById('die'),
            rollBtn: document.getElementById('roll-btn'),
            status: document.getElementById('connection-status'),
            copyBtn: document.getElementById('copy-link-btn'),
            drawBtn: document.getElementById('draw-card'),
            endBtn: document.getElementById('end-turn')
        };

        this.ui.drawBtn.onclick = () => this.drawCard();
        this.ui.endBtn.onclick = () => this.endTurn();
        this.ui.rollBtn.onclick = () => this.rollDice();
    }

    initPeer() {
        // Simple P2P setup
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');

        this.peer = new Peer();

        this.peer.on('open', (id) => {
            if (!joinId) {
                this.isHost = true;
                this.gameState.currentPlayer = id;
                this.log(`ID de Sala: ${id}`);
                this.log(`Comparte este ID o la URL para jugar.`);
                this.ui.status.innerText = `ID: ${id}`;
                this.ui.copyBtn.style.display = 'inline-block';
                this.ui.copyBtn.onclick = () => this.copyGameLink(id);
                console.log('Room ID:', id);
            } else {
                this.isHost = false;
                this.connectToHost(joinId);
            }
        });

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
        });
    }

    connectToHost(id) {
        this.log(`Conectando al Nexus: ${id}...`);
        this.conn = this.peer.connect(id);
        this.setupConnection();
    }

    copyGameLink(id) {
        const url = `${window.location.origin}${window.location.pathname}?join=${id}`;
        navigator.clipboard.writeText(url).then(() => {
            const originalText = this.ui.copyBtn.innerText;
            this.ui.copyBtn.innerText = '¡COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = originalText, 2000);
        });
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.ui.status.innerText = 'CONECTADO';
            this.log('Conexión establecida con Multivac Nexus.');
            this.startGame();
        });

        this.conn.on('data', (data) => {
            this.handleRemoteData(data);
        });
    }

    startGame() {
        this.log('Iniciando sistema...');
        for(let i=0; i<5; i++) this.drawCard(false);
        this.updateUI();
    }

    drawCard(log = true) {
        const card = CARD_POOL[Math.floor(Math.random() * CARD_POOL.length)];
        this.gameState.players.local.hand.push({ ...card, id: Date.now() + Math.random() });
        if(log) this.log(`Has robado: ${card.name}`);
        this.renderHand();
    }

    renderHand() {
        this.ui.playerHand.innerHTML = '';
        this.gameState.players.local.hand.forEach(card => {
            const el = document.createElement('div');
            el.className = 'card draw-anim';
            el.innerHTML = `
                <div class="card-name">${card.name}</div>
                <div class="card-element" style="color: var(--neon-cyan)">${card.element}</div>
                <div class="card-desc">${card.desc}</div>
            `;
            el.onclick = () => this.playCard(card);
            this.ui.playerHand.appendChild(el);
        });
    }

    playCard(card) {
        this.log(`Jugando ${card.name}...`);
        this.ui.rollBtn.disabled = false;
        this.currentAction = card;
        
        // Remove from hand
        this.gameState.players.local.hand = this.gameState.players.local.hand.filter(c => c.id !== card.id);
        this.renderHand();

        // Send to peer
        this.sendData({ type: 'CARD_PLAYED', card });
    }

    rollDice() {
        this.ui.rollBtn.disabled = true;
        const roll = Math.floor(Math.random() * 6) + 1;
        this.ui.die.innerText = roll;
        this.ui.die.classList.add('shake');
        
        setTimeout(() => {
            this.ui.die.classList.remove('shake');
            this.resolveAction(roll);
        }, 600);
    }

    resolveAction(roll) {
        const action = this.currentAction;
        let damage = 0;

        if(action.type === 'ATTACK') {
            damage = Math.floor(action.value * (roll / 2));
            this.gameState.players.remote.hp -= damage;
            this.log(`¡ATAQUE! Generado ${damage} de daño logico.`);
        } else if(action.type === 'HEAL') {
            const heal = action.value + roll;
            this.gameState.players.local.hp = Math.min(100, this.gameState.players.local.hp + heal);
            this.log(`REPARACIÓN: +${heal} HP.`);
        }

        this.updateUI();
        this.sendData({ type: 'ACTION_RESOLVED', roll, damage, hp: this.gameState.players.local.hp });
    }

    endTurn() {
        this.gameState.turn++;
        this.log('Turno finalizado. Sincronizando con Multivac...');
        
        if (this.gameState.turn % 3 === 0) {
            this.triggerMultivacGlitch();
        }
        
        this.sendData({ type: 'END_TURN', turn: this.gameState.turn });
    }

    triggerMultivacGlitch() {
        const glitches = [
            { name: 'LOGIC_SWAP', desc: '¡Intercambio de datos! HP equilibrado.' },
            { name: 'ENERGY_SURGE', desc: '¡Sobrecarga! Próximo ataque duplicado.' },
            { name: 'PACKET_LOSS', desc: '¡Pérdida de paquetes! Ambos jugadores roban una carta.' }
        ];
        const glitch = glitches[Math.floor(Math.random() * glitches.length)];
        this.log(`[ALERTA MULTIVAC] ${glitch.desc}`);
        
        if (glitch.name === 'PACKET_LOSS') {
            this.drawCard();
        } else if (glitch.name === 'LOGIC_SWAP') {
            const avg = (this.gameState.players.local.hp + this.gameState.players.remote.hp) / 2;
            this.gameState.players.local.hp = avg;
            this.gameState.players.remote.hp = avg;
            this.updateUI();
        }
        
        this.sendData({ type: 'GLITCH', glitch });
    }

    updateUI() {
        this.ui.playerHP.style.width = `${this.gameState.players.local.hp}%`;
        this.ui.opponentHP.style.width = `${this.gameState.players.remote.hp}%`;
    }

    log(msg) {
        const p = document.createElement('p');
        p.innerText = `> ${msg}`;
        this.ui.log.appendChild(p);
        this.ui.log.scrollTop = this.ui.log.scrollHeight;
    }

    sendData(data) {
        if(this.conn) this.conn.send(data);
    }

    handleRemoteData(data) {
        switch(data.type) {
            case 'CARD_PLAYED':
                this.log(`Oponente juega: ${data.card.name}`);
                break;
            case 'ACTION_RESOLVED':
                this.gameState.players.local.hp = data.remoteHP || this.gameState.players.local.hp;
                this.gameState.players.remote.hp = data.hp;
                this.updateUI();
                this.log(`Oponente sacó un ${data.roll}.`);
                break;
            case 'END_TURN':
                this.gameState.turn = data.turn || this.gameState.turn + 1;
                this.log('Es tu turno.');
                this.drawCard();
                break;
            case 'GLITCH':
                this.log(`[RESTRICCIÓN REMOTA] ${data.glitch.desc}`);
                if (data.glitch.name === 'PACKET_LOSS') this.drawCard();
                break;
        }
    }
}

// Start Game
window.game = new GameManager();
