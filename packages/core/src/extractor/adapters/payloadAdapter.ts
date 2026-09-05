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
    node.type.typeName.text === 'CollectionConfig' &&
    node.initializer &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    return {
      id: nextId(),
      name: `Payload Collection: ${node.name.text}`,
      type: 'BOUNDARY',
      entityType: 'PAYLOAD_COLLECTION',
      patternId: 'boundary.payload-collection-config',
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
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && (property.name.text === 'collections' || property.name.text === 'globals')) {
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
        }
      }
      if (entities.length > 0) return entities;
    }
  }
  return null;
}
