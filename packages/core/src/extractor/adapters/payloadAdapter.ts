import ts from 'typescript';
import { EvidenceRecord, StructuralEntity } from '../../types/index.js';
import { stableEntityId } from '../index.js';

export function extractPayloadCollectionConfig(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (
    ts.isVariableDeclaration(node) &&
    node.name &&
    ts.isIdentifier(node.name) &&
    node.type &&
    ts.isTypeReferenceNode(node.type) &&
    ts.isIdentifier(node.type.typeName) &&
    (node.type.typeName.text === 'CollectionConfig' || node.type.typeName.text === 'GlobalConfig') &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    const isGlobal = node.type.typeName.text === 'GlobalConfig';
    return {
      id: nextId(),
      name: `Payload ${isGlobal ? 'Global' : 'Collection'}: ${node.name.text}`,
      type: 'BOUNDARY',
      entityType: isGlobal ? 'PAYLOAD_GLOBAL' : 'PAYLOAD_COLLECTION',
      patternId: isGlobal ? 'boundary.payload-global-config' : 'boundary.payload-collection-config',
      evidence: getEvidence(node),
    };
  }
  return null;
}

export function extractPayloadConfigRegistry(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'buildConfig' && node.arguments.length > 0) {
    const configArg = node.arguments[0];
    if (ts.isObjectLiteralExpression(configArg)) {
      const entities: StructuralEntity[] = [];
      for (const property of configArg.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
          if (property.name.text === 'collections' || property.name.text === 'globals') {
            if (ts.isArrayLiteralExpression(property.initializer)) {
              for (const element of property.initializer.elements) {
                if (ts.isIdentifier(element)) {
                  entities.push({
                    id: nextId(),
                    name: `Payload Config Registry: ${element.text}`,
                    type: 'RELATIONSHIP',
                    entityType: 'REGISTRY_MOUNT',
                    patternId: 'relationship.payload-config-registry',
                    targetId: stableEntityId(`Payload Collection: ${element.text}`, 'BOUNDARY', `Payload Collection: ${element.text}`),
                    evidence: getEvidence(node),
                  });
                }
              }
            }
          } else if (property.name.text === 'plugins') {
            if (ts.isArrayLiteralExpression(property.initializer)) {
              for (const element of property.initializer.elements) {
                let pluginName = '';
                if (ts.isCallExpression(element) && ts.isIdentifier(element.expression)) {
                  pluginName = element.expression.text;
                } else if (ts.isIdentifier(element)) {
                  pluginName = element.text;
                }
                if (pluginName) {
                  entities.push({
                    id: nextId(),
                    name: `Payload Plugin: ${pluginName}`,
                    type: 'RELATIONSHIP',
                    entityType: 'PLUGIN_REGISTRATION',
                    patternId: 'relationship.payload-plugin-registration',
                    evidence: getEvidence(node),
                  });
                }
              }
            }
          }
        }
      }
      if (entities.length > 0) return entities;
    }
  }
  return null;
}

export function extractPayloadContracts(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
    if (node.name.text === 'fields' && ts.isArrayLiteralExpression(node.initializer)) {
      return {
        id: nextId(),
        name: 'Payload Fields Array',
        type: 'CONTRACT',
        entityType: 'PAYLOAD_FIELDS',
        patternId: 'contract.payload-field-definition',
        evidence: getEvidence(node),
      };
    }
    if (node.name.text === 'endpoints' && ts.isArrayLiteralExpression(node.initializer)) {
      return {
        id: nextId(),
        name: 'Payload Endpoints Array',
        type: 'CONTRACT',
        entityType: 'PAYLOAD_ENDPOINTS',
        patternId: 'contract.payload-endpoint-definition',
        evidence: getEvidence(node),
      };
    }
    if (node.name.text === 'access' && ts.isObjectLiteralExpression(node.initializer)) {
      return {
        id: nextId(),
        name: 'Payload Access Control',
        type: 'CONTRACT',
        entityType: 'PAYLOAD_ACCESS',
        patternId: 'contract.payload-collection-access',
        evidence: getEvidence(node),
      };
    }
  }
  return null;
}

const PAYLOAD_HOOK_NAMES = new Set([
  'beforeChange', 'afterChange', 'beforeRead', 'afterRead', 'beforeDelete', 'afterDelete',
  'beforeOperation', 'afterOperation', 'beforeValidate', 'afterValidate', 'beforeLogin',
  'afterLogin', 'afterLogout', 'afterMe', 'afterRefresh', 'afterForgotPassword', 'afterError'
]);

export function extractPayloadHooks(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity[] | null {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && PAYLOAD_HOOK_NAMES.has(node.name.text) && ts.isArrayLiteralExpression(node.initializer)) {
    const entities: StructuralEntity[] = [];
    for (const element of node.initializer.elements) {
      if (ts.isIdentifier(element)) {
        entities.push({
          id: nextId(),
          name: `Payload Hook: ${node.name.text} -> ${element.text}`,
          type: 'RELATIONSHIP',
          entityType: 'HOOK_REGISTRATION',
          patternId: 'relationship.payload-hook-registration',
          targetId: stableEntityId(`function:${element.text}`, 'CONTRACT', `Function: ${element.text}`),
          evidence: getEvidence(node),
        });
      }
    }
    if (entities.length > 0) return entities;
  }
  return null;
}

export function extractPayloadOpenConnectors(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const fnName = node.expression.text;
    if (['initTransaction', 'commitTransaction', 'rollbackTransaction', 'killTransaction'].includes(fnName)) {
      return {
        id: nextId(),
        name: `Payload Transaction: ${fnName}`,
        type: 'OPEN_CONNECTOR',
        entityType: 'DB_TRANSACTION',
        patternId: 'open-connector.payload-transaction-lifecycle',
        evidence: getEvidence(node),
      };
    }
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const objName = ts.isIdentifier(node.expression.expression) ? node.expression.expression.text : null;
    const methodName = node.expression.name.text;
    
    const callText = node.expression.getText();
    if (callText.includes("payload.db.") && ['find', 'findOne', 'create', 'updateOne', 'update', 'deleteOne', 'deleteMany', 'deleteVersions', 'count', 'countVersions'].includes(methodName)) {
      return {
        id: nextId(),
        name: `Payload DB Adapter: ${methodName}`,
        type: 'OPEN_CONNECTOR',
        entityType: 'DB_OPERATION',
        patternId: 'open-connector.payload-db-adapter-operation',
        evidence: getEvidence(node),
      };
    }

    if (callText.includes("payload.jobs.queue")) {
      return {
        id: nextId(),
        name: `Payload Job Queue: ${callText}`,
        type: "OPEN_CONNECTOR",
        entityType: "JOB_DISPATCH",
        patternId: "open-connector.payload-job-dispatch",
        evidence: getEvidence(node),
      };
    }

    if (objName === 'payload' && ['find', 'findByID', 'create', 'update', 'delete', 'count', 'findGlobal', 'updateGlobal'].includes(methodName)) {
      return {
        id: nextId(),
        name: `Payload Local API: ${methodName}`,
        type: 'OPEN_CONNECTOR',
        entityType: 'LOCAL_API_CALL',
        patternId: 'open-connector.payload-local-api-call',
        evidence: getEvidence(node),
      };
    }
    
    if (objName === 'Model' && ['create', 'find', 'findOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'aggregate', 'countDocuments', 'estimatedDocumentCount', 'bulkWrite'].includes(methodName)) {
      return {
        id: nextId(),
        name: `Mongoose DB Operation: ${methodName}`,
        type: 'OPEN_CONNECTOR',
        entityType: 'DB_OPERATION',
        patternId: 'open-connector.payload-mongoose-operation',
        evidence: getEvidence(node),
      };
    }
  }
  return null;
}


export function extractPayloadTypeRefContracts(
  node: ts.Node,
  getEvidence: (node: ts.Node) => EvidenceRecord,
  nextId: () => string
): StructuralEntity | null {
  if (
    ts.isVariableDeclaration(node) &&
    node.name && ts.isIdentifier(node.name) &&
    node.type && ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) &&
    node.initializer && ts.isObjectLiteralExpression(node.initializer)
  ) {
    if (node.type.typeName.text === 'Block') {
      return {
        id: nextId(),
        name: `Payload Block: ${node.name.text}`,
        type: 'CONTRACT',
        entityType: 'PAYLOAD_BLOCK',
        patternId: 'contract.payload-block-definition',
        evidence: getEvidence(node),
      };
    }
    if (node.type.typeName.text === 'TaskConfig') {
      return {
        id: nextId(),
        name: `Payload Task: ${node.name.text}`,
        type: 'CONTRACT',
        entityType: 'PAYLOAD_TASK',
        patternId: 'contract.payload-job-task-definition',
        evidence: getEvidence(node),
      };
    }
  }
  return null;
}
