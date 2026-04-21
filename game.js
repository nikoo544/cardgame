// Dungeon Duel: d20 Nexus - Core Logic Engine
const STANCES = {
    FIRE: { beats: 'EARTH', icon: '⚔️', label: 'ATAQUE' },
    WATER: { beats: 'FIRE', icon: '🛡️', label: 'DEFENSA' },
    EARTH: { beats: 'WATER', icon: '🧙', label: 'MAGIA' }
};

class DungeonGame {
    constructor() {
        this.peer = null;
        this.conn = null;
        
        this.localHP = 100;
        this.remoteHP = 100;
        
        this.localStance = null;
        this.remoteStance = null;
        
        this.localRoll = null;
        this.remoteRoll = null;
        
        this.initUI();
        this.initPeer();
    }

    initUI() {
        this.ui = {
            status: document.getElementById('status'),
            copyBtn: document.getElementById('copy-btn'),
            phase: document.getElementById('phase-label'),
            log: document.getElementById('battle-log'),
            playerHpBar: document.getElementById('player-hp'),
            playerHpText: document.querySelector('.player-field.local .hp-text'),
            oppHpBar: document.getElementById('opp-hp'),
            oppHpText: document.querySelector('.player-field.opponent .hp-text'),
            playerStance: document.getElementById('player-stance-reveal'),
            oppStance: document.getElementById('opp-stance-reveal'),
            dieValue: document.getElementById('die-value'),
            rollBtn: document.getElementById('roll-btn'),
            stanceBtns: document.querySelectorAll('.stance-btn')
        };

        this.ui.stanceBtns.forEach(btn => {
            btn.onclick = () => this.onStanceSelect(btn.dataset.stance);
        });

        this.ui.rollBtn.onclick = () => this.onRollClick();
        this.ui.copyBtn.onclick = () => this.copyLink();
    }

    initPeer() {
        const params = new URLSearchParams(window.location.search);
        const joinId = params.get('join');
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            if (!joinId) {
                this.isHost = true;
                this.ui.status.innerText = `GRUPO: ${id}`;
                this.log('Esperando a que un aventurero se una a la gesta...');
            } else {
                this.connect(joinId);
            }
        });

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
        });
    }

    connect(id) {
        this.log(`Viajando a la mazmorra de ${id}...`);
        this.conn = this.peer.connect(id);
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.ui.status.innerText = 'AVENTURA EN CURSO';
            this.ui.status.style.color = '#d4af37';
            this.log('¡Se ha unido un compañero! Que comience el duelo.');
            this.startRound();
        });

        this.conn.on('data', (data) => this.handleData(data));
    }

    handleData(data) {
        switch(data.type) {
            case 'STANCE_SELECT':
                this.remoteStance = data.value;
                this.log('El rival prepara su movimiento...');
                this.checkReveal();
                break;
            case 'DICE_ROLL':
                this.remoteRoll = data.value;
                this.log(`El rival ha lanzado su dado.`);
                this.checkResolution();
                break;
            case 'SYNC':
                // Final safety sync of HP
                this.localHP = data.oppHP; 
                this.remoteHP = data.myHP;
                this.updateUI();
                break;
        }
    }

    startRound() {
        this.localStance = null;
        this.remoteStance = null;
        this.localRoll = null;
        this.remoteRoll = null;
        
        this.ui.phase.innerText = 'PREPARA TU ACCIÓN';
        this.ui.playerStance.innerText = '?';
        this.ui.oppStance.innerText = '?';
        this.ui.dieValue.innerText = '?';
        
        this.ui.stanceBtns.forEach(btn => {
            btn.disabled = false;
            btn.classList.remove('selected');
        });
        this.ui.rollBtn.disabled = true;
    }

    onStanceSelect(stance) {
        this.localStance = stance;
        this.ui.playerStance.innerText = STANCES[stance].icon;
        
        this.ui.stanceBtns.forEach(btn => {
            btn.disabled = true;
            if(btn.dataset.stance === stance) btn.classList.add('selected');
        });

        this.log(`Has adoptado la postura de ${STANCES[stance].label}.`);
        this.ui.phase.innerText = 'ESPERANDO RIVAL...';
        
        this.send('STANCE_SELECT', stance);
        this.checkReveal();
    }

    checkReveal() {
        if(this.localStance && this.remoteStance) {
            this.ui.phase.innerText = '¡CHOQUE DE ACERO!';
            this.ui.oppStance.innerText = STANCES[this.remoteStance].icon;
            
            setTimeout(() => this.prepareRollPhase(), 1200);
        }
    }

    prepareRollPhase() {
        // Calculate clash advantage
        const l = this.localStance;
        const r = this.remoteStance;
        
        this.advantage = 'none';
        if (l !== r) {
            if (STANCES[l].beats === r) {
                this.advantage = 'local';
                this.log('¡Ventaja táctica! Tu ataque es más preciso (+5 al dado).');
            } else {
                this.advantage = 'remote';
                this.log('¡El rival tiene la ventaja! Prepárate para el impacto.');
            }
        } else {
            this.log('Fuerzas igualadas. Todo depende del azar.');
        }

        this.ui.phase.innerText = 'LANZA EL d20';
        this.ui.rollBtn.disabled = false;
    }

    onRollClick() {
        this.ui.rollBtn.disabled = true;
        this.ui.dieValue.classList.add('shake');
        
        setTimeout(() => {
            this.ui.dieValue.classList.remove('shake');
            const roll = Math.floor(Math.random() * 20) + 1;
            const bonus = (this.advantage === 'local') ? 5 : 0;
            const total = roll + bonus;
            
            this.ui.dieValue.innerText = total;
            this.localRoll = total;
            this.log(`Has sacado un ${roll} ${bonus > 0 ? '(+5 bono)' : ''} = ${total}.`);
            
            this.send('DICE_ROLL', total);
            this.checkResolution();
        }, 1000);
    }

    checkResolution() {
        if(this.localRoll !== null && this.remoteRoll !== null) {
            this.resolveTurn();
        }
    }

    resolveTurn() {
        const diff = this.localRoll - this.remoteRoll;
        
        if(diff > 0) {
            this.remoteHP -= diff;
            this.log(`¡ÉXITO! Infliges ${diff} de daño al rival.`);
        } else if(diff < 0) {
            this.localHP -= Math.abs(diff);
            this.log(`¡FRACASO! Recibes ${Math.abs(diff)} de daño.`);
        } else {
            this.log('¡Empate en el fragor de la batalla!');
        }

        this.updateUI();
        
        // Sync HP for safety
        this.send('SYNC', { myHP: this.localHP, oppHP: this.remoteHP });

        if(this.localHP <= 0 || this.remoteHP <= 0) {
            this.endGame();
        } else {
            setTimeout(() => this.startRound(), 3500);
        }
    }

    updateUI() {
        this.ui.playerHpBar.style.width = `${Math.max(0, this.localHP)}%`;
        this.ui.oppHpBar.style.width = `${Math.max(0, this.remoteHP)}%`;
        
        if(this.ui.playerHpText) this.ui.playerHpText.innerText = `HP: ${Math.max(0, this.localHP)}/100`;
        if(this.ui.oppHpText) this.ui.oppHpText.innerText = `HP: ${Math.max(0, this.remoteHP)}/100`;
    }

    endGame() {
        const win = this.localHP > 0;
        this.ui.phase.innerText = win ? '¡VICTORIA HEROICA!' : 'HAS CAÍDO EN COMBATE';
        this.log(win ? 'La mazmorra es tuya.' : 'Tu aventura termina aquí.');
    }

    send(type, value) {
        if(this.conn) this.conn.send({ type, value });
    }

    log(msg) {
        const p = document.createElement('div');
        p.style.marginBottom = '5px';
        p.innerText = `> ${msg}`;
        this.ui.log.prepend(p);
    }

    copyLink() {
        const url = `${window.location.origin}${window.location.pathname}?join=${this.peer.id}`;
        navigator.clipboard.writeText(url).then(() => {
            this.ui.copyBtn.innerText = '¡ENLACE COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = 'INVITAR AVENTURERO', 2000);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new DungeonGame();
});
