const io = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function connect(name, previousPlayerId = null) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER, { transports: ['websocket'] });
        socket.on('connect', () => {
            socket.emit('join_lobby', { username: name, previousPlayerId });
        });
        socket.on('join_lobby_response', (data) => resolve({ socket, data }));
        socket.on('connect_error', (err) => reject(err));
        socket.on('error', (err) => console.error('socket error', err));
    });
}

(async () => {
    console.log('Starting orb-splitting test against', SERVER);
    const a = await connect('Alice');
    const b = await connect('Bob');
    const sa = a.socket;
    const sb = b.socket;
    const aid = a.data.playerId;
    const bid = b.data.playerId;
    console.log('Connected A=', aid, 'B=', bid);

    // Wait until server match starts and orbs are present via state_update
    console.log('Waiting for orbs to appear in state_update...');
    const orbId = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for orbs')), 8000);
        function onState(d) {
            if (d && d.orbs && d.orbs.length > 0) {
                clearTimeout(timeout);
                sa.off('state_update', onState);
                sb.off('state_update', onState);
                resolve(d.orbs[0].id);
            }
        }
        sa.on('state_update', onState);
        sb.on('state_update', onState);
    });
    console.log('Using orb', orbId);

    // Attach A -> B and accept
    sa.emit('attach_request', { targetPlayerId: bid });
    await new Promise((res) => {
        sb.once('attach_request', (d) => {
            sb.emit('attach_response', { fromPlayerId: d.fromPlayerId, accepted: true });
            res();
        });
    });

    // Wait for attach_accepted on either socket
    await new Promise((res) => {
        let got = 0;
        function cb() { got++; if (got >= 1) res(); }
        sa.once('attach_accepted', cb);
        sb.once('attach_accepted', cb);
        setTimeout(res, 1000);
    });

    console.log('Attached, now collecting orb as Alice');

    const received = [];
    function onCollected(d) {
        received.push(d);
        if (received.length >= 2) {
            // Expect split points (ORB value 10 -> 5/5)
            const pts = received.map(r => r.points).sort((x, y) => x - y);
            const ok = pts[0] === 5 && pts[1] === 5;
            if (ok) {
                console.log('Orb splitting OK:', received);
                cleanup(0);
            } else {
                console.error('Unexpected orb points:', received);
                cleanup(1);
            }
        }
    }
    sa.on('orb_collected', onCollected);
    sb.on('orb_collected', onCollected);

    // Trigger collection from Alice
    sa.emit('collect_orb', { orbId });

    // Fallback timeout
    setTimeout(() => {
        if (received.length < 2) {
            console.error('Timeout waiting for orb_collected events; got', received);
            cleanup(1);
        }
    }, 3000);

    function cleanup(code) {
        sa.close(); sb.close(); process.exit(code);
    }

})();
