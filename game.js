// Nexus Tactics: Dungeon Chess - Logic Engine
// P2P Multiplayer using PeerJS

const PIECES = {
    WARRIOR: { icon: '⚔️', hp: 50, atk: 10, def: 5, move: 'king', label: 'Guerrero' },
    WIZARD: { icon: '🧙', hp: 30, atk: 15, def: 2, move: 'queen', label: 'Mago' },
    ROGUE: { icon: '🗡️', hp: 35, atk: 12, def: 3, move: 'knight', label: 'Pícaro' },
    CLERIC: { icon: '✨', hp: 40, atk: 8, def: 4, move: 'bishop', label: 'Clérigo' },
    FIGHTER: { icon: '🛡️', hp: 45, atk: 9, def: 6, move: 'rook', label: 'Luchador' },
    SCOUT: { icon: '🏹', hp: 25, atk: 11, def: 2, move: 'pawn', label: 'Explorador' }
};

class DungeonChess {
    constructor() {
        this.board = Array(64).fill(null);
        this.selectedTile = null;
        this.validMoves = [];
        this.turn = 1; // 1 or 2
        this.peer = null;
        this.conn = null;
        this.localPlayerNum = 1; 
        this.deck = [
            { id: 'HEAL', label: 'Curación', desc: 'Sana 15 HP a una unidad.', type: 'TARGET' },
            { id: 'SMITE', label: 'Golpe Sagrado', desc: '+10 daño próximo ataque.', type: 'BUFF' },
            { id: 'FIREBALL', label: 'Bola de Fuego', desc: '10 daño en área.', type: 'TARGET' }
        ];
        this.hand = [];
        this.turnCount = 0;
        
        this.initBoard();
        this.initUI();
        this.initPeer();
    }

    initBoard() {
        // Player 1 (Bottom)
        this.placePiece(56, 'FIGHTER', 1);
        this.placePiece(57, 'ROGUE', 1);
        this.placePiece(58, 'CLERIC', 1);
        this.placePiece(59, 'WIZARD', 1);
        this.placePiece(60, 'WARRIOR', 1);
        this.placePiece(61, 'CLERIC', 1);
        this.placePiece(62, 'ROGUE', 1);
        this.placePiece(63, 'FIGHTER', 1);
        for(let i=48; i<56; i++) this.placePiece(i, 'SCOUT', 1);

        // Player 2 (Top)
        this.placePiece(0, 'FIGHTER', 2);
        this.placePiece(1, 'ROGUE', 2);
        this.placePiece(2, 'CLERIC', 2);
        this.placePiece(3, 'WIZARD', 2);
        this.placePiece(4, 'WARRIOR', 2);
        this.placePiece(5, 'CLERIC', 2);
        this.placePiece(6, 'ROGUE', 2);
        this.placePiece(7, 'FIGHTER', 2);
        for(let i=8; i<16; i++) this.placePiece(i, 'SCOUT', 2);
    }

    placePiece(index, type, owner) {
        const stats = PIECES[type];
        this.board[index] = { ...stats, type, owner, currentHP: stats.hp };
    }

    initUI() {
        this.ui = {
            board: document.getElementById('board'),
            log: document.getElementById('battle-log'),
            status: document.getElementById('status'),
            phase: document.getElementById('phase-status'),
            details: document.getElementById('unit-details'),
            dieValue: document.getElementById('die-value'),
            copyBtn: document.getElementById('copy-btn'),
            turnLabel: document.getElementById('current-turn-label'),
            hand: document.getElementById('card-hand')
        };

        this.renderBoard();
        this.ui.copyBtn.onclick = () => this.copyLink();
    }

    renderBoard() {
        this.ui.board.innerHTML = '';
        for (let i = 0; i < 64; i++) {
            const tile = document.createElement('div');
            const row = Math.floor(i / 8);
            const col = i % 8;
            tile.className = `tile ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            tile.dataset.index = i;
            
            if (this.selectedTile === i) tile.classList.add('selected');
            if (this.validMoves.includes(i)) {
                const target = this.board[i];
                if (target && target.owner !== this.localPlayerNum) {
                    tile.classList.add('attack-target');
                } else {
                    tile.classList.add('highlight');
                }
            }

            const piece = this.board[i];
            if (piece) {
                const pEl = document.createElement('div');
                pEl.className = `piece player${piece.owner}`;
                pEl.innerText = piece.icon;
                
                const hpBar = document.createElement('div');
                hpBar.className = 'hp-mini-bar';
                const hpFill = document.createElement('div');
                hpFill.className = 'hp-fill';
                hpFill.style.width = `${(piece.currentHP / piece.hp) * 100}%`;
                hpBar.appendChild(hpFill);
                
                tile.appendChild(pEl);
                tile.appendChild(hpBar);
            }

            tile.onclick = () => this.handleTileClick(i);
            this.ui.board.appendChild(tile);
        }
        this.ui.turnLabel.innerText = `JUGADOR ${this.turn}`;
        this.ui.turnLabel.style.color = this.turn === 1 ? 'white' : 'red';
    }

    handleTileClick(index) {
        if (this.turn !== this.localPlayerNum) {
            this.log('No es tu turno, aventurero.');
            return;
        }

        const piece = this.board[index];

        // 1. Selecting a piece
        if (piece && piece.owner === this.localPlayerNum) {
            this.selectedTile = index;
            this.validMoves = this.calculateValidMoves(index);
            this.updateDetails(piece);
            this.renderBoard();
            return;
        }

        // 2. Moving/Attacking
        if (this.selectedTile !== null && this.validMoves.includes(index)) {
            const sourcePiece = this.board[this.selectedTile];
            const targetPiece = this.board[index];

            if (targetPiece) {
                this.startCombat(this.selectedTile, index);
            } else {
                this.movePiece(this.selectedTile, index);
            }
            return;
        }

        // 3. Deselect
        this.selectedTile = null;
        this.validMoves = [];
        this.renderBoard();
    }

    calculateValidMoves(index) {
        const piece = this.board[index];
        const moves = [];
        const r = Math.floor(index / 8);
        const c = index % 8;

        const addMove = (row, col) => {
            if (row >= 0 && row < 8 && col >= 0 && col < 8) {
                const i = row * 8 + col;
                const target = this.board[i];
                if (!target || target.owner !== piece.owner) {
                    moves.push(i);
                    return !target; // Stop if there's a piece (to capture)
                }
            }
            return false;
        };

        const dirs = {
            plus: [[0,1],[0,-1],[1,0],[-1,0]],
            cross: [[1,1],[1,-1],[-1,1],[-1,-1]],
            knight: [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]
        };

        if (piece.move === 'king' || piece.move === 'pawn') {
            const step = (piece.owner === 1) ? -1 : 1;
            [[step, 0], [step, 1], [step, -1], [0, 1], [0, -1], [-step, 0]].forEach(d => addMove(r + d[0], c + d[1]));
        } else if (piece.move === 'queen') {
            [...dirs.plus, ...dirs.cross].forEach(d => {
                for(let s=1; s<8; s++) if(!addMove(r + d[0]*s, c + d[1]*s)) break;
            });
        } else if (piece.move === 'knight') {
            dirs.knight.forEach(d => addMove(r + d[0], c + d[1]));
        } else if (piece.move === 'bishop') {
            dirs.cross.forEach(d => {
                for(let s=1; s<8; s++) if(!addMove(r + d[0]*s, c + d[1]*s)) break;
            });
        } else if (piece.move === 'rook') {
            dirs.plus.forEach(d => {
                for(let s=1; s<8; s++) if(!addMove(r + d[0]*s, c + d[1]*s)) break;
            });
        }

        return moves;
    }

    movePiece(from, to) {
        this.board[to] = this.board[from];
        this.board[from] = null;
        this.selectedTile = null;
        this.validMoves = [];
        this.endTurn();
        this.sendState();
        this.renderBoard();
    }

    startCombat(from, to) {
        const attacker = this.board[from];
        const defender = this.board[to];
        this.log(`¡Combate! ${attacker.label} ataca a ${defender.label}.`);
        
        const roll = Math.floor(Math.random() * 20) + 1;
        this.ui.dieValue.innerText = roll;
        this.ui.dieValue.classList.add('shake');
        
        setTimeout(() => {
            this.ui.dieValue.classList.remove('shake');
            const damage = Math.max(1, (roll + attacker.atk) - defender.def);
            defender.currentHP -= damage;
            this.log(`${attacker.label} saca ${roll} e inflige ${damage} de daño.`);

            if (defender.currentHP <= 0) {
                this.log(`${defender.label} ha caído.`);
                this.board[to] = this.board[from];
                this.board[from] = null;
            }
            
            this.selectedTile = null;
            this.validMoves = [];
            this.endTurn();
            this.sendState();
            this.renderBoard();
        }, 800);
    }

    endTurn() {
        this.turnCount++;
        this.turn = this.turn === 1 ? 2 : 1;
        if (this.turn === this.localPlayerNum && this.turnCount % 4 === 0) {
            this.drawCard();
        }
    }

    drawCard() {
        const card = this.deck[Math.floor(Math.random() * this.deck.length)];
        this.hand.push({ ...card, instanceId: Date.now() });
        this.renderHand();
        this.log(`¡Has robado una carta: ${card.label}!`);
    }

    renderHand() {
        this.ui.hand.innerHTML = '';
        this.hand.forEach(card => {
            const el = document.createElement('div');
            el.className = 'card';
            el.innerHTML = `<strong>${card.label}</strong><br><small>${card.desc}</small>`;
            el.onclick = () => this.useCard(card);
            this.ui.hand.appendChild(el);
        });
    }

    useCard(card) {
        this.log(`Usando carta: ${card.label}`);
        // Simple logic for example
        if (card.id === 'HEAL' && this.selectedTile !== null) {
            const piece = this.board[this.selectedTile];
            if (piece && piece.owner === this.localPlayerNum) {
                piece.currentHP = Math.min(piece.hp, piece.currentHP + 15);
                this.log(`${piece.label} ha sido sanado.`);
                this.hand = this.hand.filter(c => c.instanceId !== card.instanceId);
                this.renderHand();
                this.sendState();
                this.renderBoard();
            }
        }
    }

    updateDetails(piece) {
        this.ui.details.innerHTML = `
            <strong>${piece.label}</strong><br>
            HP: ${piece.currentHP}/${piece.hp}<br>
            Ataque: ${piece.atk} | Def: ${piece.def}<br>
            <small>Movimiento: ${piece.move}</small>
        `;
    }

    log(msg) {
        const p = document.createElement('div');
        p.innerText = `> ${msg}`;
        this.ui.log.prepend(p);
    }

    // --- Multiplayer Logic ---

    initPeer() {
        const params = new URLSearchParams(window.location.search);
        const joinId = params.get('join');
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            if (!joinId) {
                this.ui.status.innerText = `ID: ${id}`;
                this.log('Nexus abierto. Esperando rival...');
            } else {
                this.localPlayerNum = 2;
                this.connect(joinId);
            }
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
            this.ui.status.innerText = 'CONECTADO';
            this.log('¡Conexión establecida! Prepárate para la batalla.');
            this.sendState();
        });
        this.conn.on('data', (data) => {
            if (data.type === 'SYNC') {
                this.board = data.board;
                this.turn = data.turn;
                this.renderBoard();
            }
        });
    }

    sendState() {
        if (this.conn) {
            this.send('SYNC', { board: this.board, turn: this.turn });
        }
    }

    send(type, value) {
        if (this.conn) this.conn.send({ type, ...value });
    }

    copyLink() {
        const url = `${window.location.origin}${window.location.pathname}?join=${this.peer.id}`;
        navigator.clipboard.writeText(url).then(() => {
            this.ui.copyBtn.innerText = '¡COPIADO!';
            setTimeout(() => this.ui.copyBtn.innerText = 'INVITAR RIVAL', 2000);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.game = new DungeonChess();
});
