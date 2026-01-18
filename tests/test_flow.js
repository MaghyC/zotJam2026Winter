const io = require('socket.io-client');

const SERVER = process.env.SERVER_URL || 'http://localhost:3000';

function connect(name) {
    return new Promise((resolve, reject) => {
        const socket = io(SERVER, { transports: ['websocket'] });
        socket.on('connect', () => {
            socket.emit('join_lobby', { username: name });
        });
        socket.on('join_lobby_response', (data) => {
            resolve({ socket, data });
        });
        socket.on('connect_error', (err) => reject(err));
        socket.on('error', (err) => console.error('socket error', err));
    });
}

(async () => {
    console.log('Starting integration test against', SERVER);
    const a = await connect('Alice');
    const b = await connect('Bob');

    const sa = a.socket;
    const sb = b.socket;

    console.log('Connected A=', a.data.playerId, 'B=', b.data.playerId);

    const lobby = a.data.lobbyCode;

    // wire listeners
    sa.on('attach_request', (d) => console.log('[A] attach_request', d));
    sb.on('attach_request', (d) => {
        console.log('[B] attach_request', d);
    });

    sa.on('attach_accepted', (d) => console.log('[A] attach_accepted', d));
    sb.on('attach_accepted', (d) => console.log('[B] attach_accepted', d));

    sa.on('attach_declined', (d) => console.log('[A] attach_declined', d));
    sb.on('attach_declined', (d) => console.log('[B] attach_declined', d));

    sa.on('player_detached', (d) => console.log('[A] player_detached', d));
    sb.on('player_detached', (d) => console.log('[B] player_detached', d));

    sa.on('control_request', (d) => console.log('[A] control_request', d));
    sb.on('control_request', (d) => console.log('[B] control_request', d));
    sa.on('control_granted', (d) => console.log('[A] control_granted', d));
    sb.on('control_granted', (d) => console.log('[B] control_granted', d));
    sa.on('control_response', (d) => console.log('[A] control_response', d));
    sb.on('control_response', (d) => console.log('[B] control_response', d));

    sa.on('attach_signal', (d) => console.log('[A] attach_signal', d));
    sb.on('attach_signal', (d) => console.log('[B] attach_signal', d));

    // Start attach flow: A -> B
    console.log('Sending attach_request from A to B');
    sa.emit('attach_request', { targetPlayerId: b.data.playerId });

    // B accept after short delay
    sb.once('attach_request', (d) => {
        console.log('B received attach_request, accepting');
        sb.emit('attach_response', { fromPlayerId: d.fromPlayerId, accepted: true });

        setTimeout(() => {
            // A requests control (N) -> control_request
            console.log('A requests control of pair');
            sa.emit('control_request', { targetPlayerId: b.data.playerId });
        }, 200);
    });

    // B handles control_request and accepts
    sb.on('control_request', (d) => {
        console.log('B got control_request, accepting');
        sb.emit('control_response', { toPlayerId: d.fromPlayerId, accepted: true });
    });

    // After attached, A sends signal_orb
    sa.on('attach_accepted', (d) => {
        console.log('Attached, sending signal_orb from A');
        sa.emit('signal_orb', { gaze: { x: 1, y: 0, z: 0 } });

        setTimeout(() => {
            console.log('Now detaching via A');
            sa.emit('detach', {});

            setTimeout(() => {
                console.log('Closing sockets');
                sa.close();
                sb.close();
                console.log('Integration test complete');
            }, 500);
        }, 300);
    });

})();
