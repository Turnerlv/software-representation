// packages/core/src/extractor/visitors/eventEmitterVisitor.ts
// Visitor functions for Node.js EventEmitter subscriber contracts and publisher relationships.
// Also handles Socket.IO wildcard listeners (onAny) and NodeBB-style plugin hook dispatches (plugins.hooks.fire).

import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';

/**
 * Extracts an EventEmitter subscriber call (`.on('event', fn)`, `.addListener(...)`, `.once(...)`)
 * as a CONTRACT primitive entity.
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity for the listener, or null if node does not match.
 */
export function extractEventEmitterContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    if (methodName === 'on' || methodName === 'addListener' || methodName === 'once') {
      if (node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          return {
            id: nextId(),
            name: `Event Listener: ${firstArg.text}`,
            type: 'CONTRACT',
            entityType: 'EVENT_LISTENER', patternId: 'contract.event-emitter-listener',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}

/**
 * Extracts a Socket.IO wildcard listener call (`.onAny(callback)`)
 * as a CONTRACT primitive entity.
 *
 * `.onAny()` is Socket.IO-specific and intercepts ALL incoming events before they
 * are routed to named handlers. It is structurally the primary message dispatcher
 * in architectures like NodeBB — more significant than a named `socket.on()` listener.
 *
 * @example
 * // Target code:
 * socket.onAny((event, ...args) => { dispatchToHandler(event, args); });
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns A CONTRACT StructuralEntity with entityType EVENT_LISTENER and name
 *          'Event Listener: [wildcard]', or null if node does not match.
 */
export function extractSocketOnAnyContract(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    if (methodName === 'onAny') {
      return {
        id: nextId(),
        name: 'Event Listener: [wildcard]',
        type: 'CONTRACT',
        entityType: 'EVENT_LISTENER', patternId: 'contract.socket-onany-listener',
        evidence: getEvidence(node),
      };
    }
  }
  return null;
}

/**
 * Extracts a plugin hook dispatch call (`plugins.hooks.fire(hookName, data)`)
 * as an OPEN_CONNECTOR primitive entity.
 *
 * NodeBB's plugin system exposes named extension points via `plugins.hooks.fire(hookName, ...)`.
 * Subscribers register dynamically at runtime and are unknown at static analysis time —
 * structurally equivalent to `EventEmitter.emit()`, which is already an OPEN_CONNECTOR.
 * The hook name string literal (e.g. `'action:sockets.disconnect'`) becomes the connector name.
 *
 * @example
 * // Target code:
 * plugins.hooks.fire('action:sockets.disconnect', { socket });
 * plugins.hooks.fire('filter:sockets.sessionId', { sessionId, request });
 *
 * Detection strategy: callee must be a chain ending in `.fire()` with a parent `.hooks`
 * accessor (i.e. `<any>.hooks.fire(...)`). The first argument must be a string literal.
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity with the hook name, or null if node does not match.
 */
export function extractPluginHookFire(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (!ts.isCallExpression(node)) return null;
  if (!ts.isPropertyAccessExpression(node.expression)) return null;

  const methodName = node.expression.name.text;
  if (methodName !== 'fire') return null;

  // Confirm the receiver is `*.hooks` (i.e. <anything>.hooks.fire(...))
  const receiver = node.expression.expression;
  if (
    !ts.isPropertyAccessExpression(receiver) ||
    receiver.name.text !== 'hooks'
  ) {
    return null;
  }

  // First argument must be a string literal (the hook name)
  if (node.arguments.length < 1) return null;
  const firstArg = node.arguments[0];
  if (!ts.isStringLiteral(firstArg)) return null;

  return {
    id: nextId(),
    name: `Plugin Hook: ${firstArg.text}`,
    type: 'OPEN_CONNECTOR',
    entityType: 'PLUGIN_HOOK', patternId: 'open-connector.plugin-hook-fire',
    evidence: getEvidence(node),
  };
}

/**
 * Extracts an EventEmitter publisher call (`.emit('event', ...payload)`)
 * as an OPEN_CONNECTOR primitive entity (since we don't know who is listening at static analysis time).
 *
 * @param node        The AST node to inspect.
 * @param getEvidence Callback returning an EvidenceRecord for the node.
 * @param nextId      Closure providing a placeholder entity ID.
 * @returns An OPEN_CONNECTOR StructuralEntity for the event dispatch, or null if node does not match.
 */
export function extractEventEmitterEmit(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const methodName = node.expression.name.text;
    
    if (methodName === 'emit') {
      if (node.arguments.length >= 1) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg)) {
          return {
            id: nextId(),
            name: `Event Emit: ${firstArg.text}`,
            type: 'OPEN_CONNECTOR',
            entityType: 'EVENT_EMIT', patternId: 'open-connector.event-emitter-emit',
            evidence: getEvidence(node),
          };
        }
      }
    }
  }

  return null;
}
