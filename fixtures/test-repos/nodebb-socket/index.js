'use strict';

const plugins = require('../plugins');

// Pattern: contract.socket-onany-listener
// socket.onAny() is a Socket.IO wildcard listener that intercepts ALL
// incoming events before routing. It is the primary message dispatcher.
socket.onAny((event, ...args) => {
  dispatchToHandler(event, args);
});

// Pattern: open-connector.plugin-hook-fire
// plugins.hooks.fire() dispatches to dynamically-registered plugin subscribers.
// The hook name is a named extension point; subscribers are unknown at static analysis time.
plugins.hooks.fire('action:sockets.disconnect', { socket: socket });
plugins.hooks.fire('filter:sockets.sessionId', { sessionId: null, request: req });
