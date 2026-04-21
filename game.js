// Elemental Nexus: Multivac's Gambit - Logic Engine v2 (RPS + Dice)
// Using PeerJS for P2P connection

const STANCES = {
    FIRE: { beats: 'EARTH', label: '🔥 FUEGO', color: '#ff4b2b' },
    WATER: { beats: 'FIRE', label: '💧 AGUA', color: '#00d2ff' },
    EARTH: { beats: 'WATER', label: '🌿 TIERRA', color: '#a8ff78' }
};

class GameManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.isHost = false;
        this.gameState = {
            phase: 'WAITING', // WAITING, SELECTION, REVEAL, ACTION
            localHP: 100,
            remoteHP: 100,
            localStance: null,
            remoteStance: null,
            clashWinner: null
        };

        this.initElements();
        this.initPeer();
    }

    initElements() {
        this.ui = {
            log: document.getElementById('battle-log'),
            playerHP: document.querySelector('#player-monster .hp-fill'),
            opponentHP: document.querySelector('#opponent-monster .hp-fill'),
            playerStance: document.getElementById('player-stance-display'),
            opponentStance: document.getElementById('opponent-stance-display'),
            die: document.getElementById('die'),
            rollBtn: document.getElementById('roll-btn'),
            status: document.getElementById('connection-status'),
            copyBtn: document.getElementById('copy-link-btn'),
            phaseInd: document.getElementById('phase-indicator'),
            stanceBtns: document.querySelectorAll('.stance-btn')
        };

        this.ui.stanceBtns.forEach(btn => {
            btn.onclick = () => this.selectStance(btn.dataset.stance);
        });

        this.ui.rollBtn.onclick = () => this.rollDice();
    }

    initPeer() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            if (!joinId) {
                this.isHost = true;
                this.log(`ID de Sala: ${id}`);
                this.ui.status.innerText = `ID: ${id}`;
                this.ui.copyBtn.style.display = 'inline-block';
                this.ui.copyBtn.onclick = () => this.copyGameLink(id);
            } else {
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
            this.ui.copyBtn.innerText = '¡COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = 'COPIAR LINK', 2000);
        });
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.ui.status.innerText = 'CONECTADO';
            this.log('Enlace neuronal establecido.');
            this.startNewRound();
        });

        this.conn.on('data', (data) => this.handleRemoteData(data));
    }

    startNewRound() {
        this.gameState.phase = 'SELECTION';
        this.gameState.localStance = null;
        this.gameState.remoteStance = null;
        this.gameState.clashWinner = null;
        
        this.ui.phaseInd.innerText = 'FASE: SELECCIÓN DE POSTURA';
        this.ui.playerStance.innerText = 'ELIGE TU ELEMENTO';
        this.ui.opponentStance.innerText = '???';
        this.ui.opponentStance.style.color = 'var(--neon-purple)';
        
        this.ui.stanceBtns.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('selected');
        });
        this.ui.rollBtn.disabled = true;
    }

    selectStance(stance) {
        if(this.gameState.phase !== 'SELECTION') return;
        
        this.gameState.localStance = stance;
        this.log(`Postura asumida: ${STANCES[stance].label}`);
        this.ui.playerStance.innerText = STANCES[stance].label;
        this.ui.playerStance.style.color = STANCES[stance].color;
        
        this.ui.stanceBtns.forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.stance === stance);
            btn.disabled = true;
        });

        this.sendData({ type: 'STANCE_SELECTED', stance });
        this.checkClash();
    }

    handleRemoteData(data) {
        switch(data.type) {
            case 'STANCE_SELECTED':
                this.gameState.remoteStance = data.stance;
                this.log('El oponente ha elegido su postura.');
                this.checkClash();
                break;
            case 'DICE_ROLLED':
                this.resolveBattle(data.roll, data.damage);
                break;
        }
    }

    checkClash() {
        if (this.gameState.localStance && this.gameState.remoteStance) {
            this.gameState.phase = 'REVEAL';
            this.ui.phaseInd.innerText = 'FASE: CHOQUE ELEMENTAL';
            
            setTimeout(() => this.resolveClash(), 1000);
        }
    }

    resolveClash() {
        const local = this.gameState.localStance;
        const remote = this.gameState.remoteStance;
        
        this.ui.opponentStance.innerText = STANCES[remote].label;
        this.ui.opponentStance.style.color = STANCES[remote].color;

        if (local === remote) {
            this.log('¡Empate elemental! El Nexo está en equilibrio.');
            this.gameState.clashWinner = 'TIE';
        } else if (STANCES[local].beats === remote) {
            this.log(`¡Ventaja local! ${STANCES[local].label} domina a ${STANCES[remote].label}.`);
            this.gameState.clashWinner = 'LOCAL';
        } else {
            this.log(`¡Desventaja! ${STANCES[remote].label} domina a ${STANCES[local].label}.`);
            this.gameState.clashWinner = 'REMOTE';
        }

        this.gameState.phase = 'ACTION';
        this.ui.phaseInd.innerText = 'FASE: ACCIÓN (LANZAR DADO)';
        
        if (this.gameState.clashWinner !== 'REMOTE') {
            this.ui.rollBtn.disabled = false;
        } else {
            this.log('Esperando ataque del oponente...');
        }
    }

    rollDice() {
        this.ui.rollBtn.disabled = true;
        this.ui.die.classList.add('shake');
        
        setTimeout(() => {
            this.ui.die.classList.remove('shake');
            const roll = Math.floor(Math.random() * 20) + 1; // d20
            const bonus = (this.gameState.clashWinner === 'LOCAL') ? 5 : 0;
            const totalRoll = roll + bonus;
            
            this.ui.die.innerText = totalRoll;
            
            const damage = Math.floor(totalRoll * 0.8);
            this.gameState.remoteHP -= damage;
            
            this.log(`¡Impacto crítico! Tirada ${roll} + Bono ${bonus} = ${totalRoll}. Daño: ${damage}.`);
            this.updateUI();
            
            this.sendData({ type: 'DICE_ROLLED', roll: totalRoll, damage });
            
            setTimeout(() => this.startNewRound(), 3000);
        }, 1000);
    }

    resolveBattle(remoteRoll, damage) {
        this.ui.die.innerText = remoteRoll;
        this.gameState.localHP -= damage;
        this.log(`El oponente ataca con una potencia de ${remoteRoll}. Recibes ${damage} de daño.`);
        this.updateUI();
        
        if (this.gameState.localHP <= 0) {
            this.log('CRITICAL FAILURE: Núcleo destruido.');
        }

        setTimeout(() => this.startNewRound(), 3000);
    }

    updateUI() {
        this.ui.playerHP.style.width = `${Math.max(0, this.gameState.localHP)}%`;
        this.ui.opponentHP.style.width = `${Math.max(0, this.gameState.remoteHP)}%`;
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
}

window.game = new GameManager();
