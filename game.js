// Battle Nexus 1v1 - Core Logic Engine
const STANCES = {
    FIRE: { beats: 'EARTH', icon: '🔥', label: 'FUEGO' },
    WATER: { beats: 'FIRE', icon: '💧', label: 'AGUA' },
    EARTH: { beats: 'WATER', icon: '🌿', label: 'TIERRA' }
};

class Game {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.hp = { local: 100, remote: 100 };
        this.choices = { local: null, remote: null };
        this.rolls = { local: null, remote: null };
        this.isHost = false;
        
        this.initUI();
        this.initPeer();
    }

    initUI() {
        this.ui = {
            status: document.getElementById('status'),
            copyBtn: document.getElementById('copy-btn'),
            phase: document.getElementById('phase-label'),
            log: document.getElementById('battle-log'),
            playerHp: document.getElementById('player-hp'),
            oppHp: document.getElementById('opp-hp'),
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
                this.ui.status.innerText = `ID: ${id}`;
                this.log('Sistema listo. Esperando oponente...');
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
        this.log(`Conectando a ${id}...`);
        this.conn = this.peer.connect(id);
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            this.ui.status.innerText = 'CONECTADO';
            this.log('¡Oponente conectado! Iniciando combate...');
            this.startRound();
        });

        this.conn.on('data', (data) => this.handleData(data));
    }

    handleData(data) {
        switch(data.type) {
            case 'STANCE':
                this.choices.remote = data.value;
                this.log('El rival ha elegido su postura.');
                this.checkReveal();
                break;
            case 'ROLL':
                this.rolls.remote = data.value;
                this.log(`El rival lanzó el dado: ${data.value}`);
                this.resolveTurn();
                break;
            case 'SYNC_HP':
                this.hp.local = data.hp;
                this.updateHP();
                break;
        }
    }

    startRound() {
        this.choices = { local: null, remote: null };
        this.rolls = { local: null, remote: null };
        
        this.ui.phase.innerText = 'ELIGE TU POSTURA';
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
        this.choices.local = stance;
        this.ui.playerStance.innerText = STANCES[stance].icon;
        
        this.ui.stanceBtns.forEach(btn => {
            btn.disabled = true;
            if(btn.dataset.stance === stance) btn.classList.add('selected');
        });

        this.send('STANCE', stance);
        this.checkReveal();
    }

    checkReveal() {
        if(this.choices.local && this.choices.remote) {
            this.ui.phase.innerText = 'CHOQUE ELEMENTAL';
            this.ui.oppStance.innerText = STANCES[this.choices.remote].icon;
            
            setTimeout(() => this.prepareAction(), 1500);
        }
    }

    prepareAction() {
        const result = this.getClashResult();
        this.clashWinner = result; // 'local', 'remote', or 'tie'
        
        if(result === 'tie') this.log('¡Empate! Ambos lanzan dados.');
        else if(result === 'local') this.log('¡Ventaja para ti! (+5 a tu dado)');
        else this.log('¡Ventaja para el rival! (+5 a su dado)');

        this.ui.phase.innerText = 'LANZA EL DADO (d20)';
        this.ui.rollBtn.disabled = false;
    }

    getClashResult() {
        const l = this.choices.local;
        const r = this.choices.remote;
        if(l === r) return 'tie';
        return (STANCES[l].beats === r) ? 'local' : 'remote';
    }

    onRollClick() {
        this.ui.rollBtn.disabled = true;
        this.ui.dieValue.classList.add('shake');
        
        setTimeout(() => {
            this.ui.dieValue.classList.remove('shake');
            let roll = Math.floor(Math.random() * 20) + 1;
            const bonus = (this.clashWinner === 'local') ? 5 : 0;
            const final = roll + bonus;
            
            this.ui.dieValue.innerText = final;
            this.rolls.local = final;
            this.log(`Tu tirada: ${roll} ${bonus > 0 ? '+5 bono' : ''} = ${final}`);
            
            this.send('ROLL', final);
            this.resolveTurn();
        }, 800);
    }

    resolveTurn() {
        if(this.rolls.local && this.rolls.remote) {
            // Calculate Damage
            const diff = this.rolls.local - this.rolls.remote;
            
            if(diff > 0) {
                this.hp.remote -= diff;
                this.log(`¡Ganas el intercambio! Infliges ${diff} de daño.`);
            } else if(diff < 0) {
                this.hp.local -= Math.abs(diff);
                this.log(`¡Pierdes el intercambio! Recibes ${Math.abs(diff)} de daño.`);
            } else {
                this.log('¡Choque de fuerzas! Nadie recibe daño.');
            }

            this.updateHP();
            this.send('SYNC_HP', { hp: this.hp.remote }); // Sync remote's view of their HP

            if(this.hp.local <= 0 || this.hp.remote <= 0) {
                this.endGame();
            } else {
                setTimeout(() => this.startRound(), 3000);
            }
        }
    }

    updateHP() {
        this.ui.playerHp.style.width = `${Math.max(0, this.hp.local)}%`;
        this.ui.oppHp.style.width = `${Math.max(0, this.hp.remote)}%`;
    }

    endGame() {
        const win = this.hp.local > 0;
        this.ui.phase.innerText = win ? '¡VICTORIA!' : 'DERROTA';
        this.log(win ? 'Has dominado el Nexus.' : 'Tu conexión se ha extinguido.');
    }

    send(type, value) {
        if(this.conn) this.conn.send({ type, value });
    }

    log(msg) {
        const p = document.createElement('div');
        p.innerText = `> ${msg}`;
        this.ui.log.prepend(p);
    }

    copyLink() {
        const url = `${window.location.origin}${window.location.pathname}?join=${this.peer.id}`;
        navigator.clipboard.writeText(url).then(() => {
            this.ui.copyBtn.innerText = '¡COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = 'COPIAR LINK', 2000);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
});
