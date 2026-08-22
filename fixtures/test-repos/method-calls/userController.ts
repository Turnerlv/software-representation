import { userService } from './userService';
import { otherService } from './otherService'; // Note: otherService.ts does not exist

export function handleRequest() {
  // HIGH confidence (matches import, and method 'createUser' exists in target)
  userService.createUser();

  // MEDIUM confidence (matches import, but target file doesn't exist so we can't verify export)
  otherService.someMethod();

  // LOW confidence (no matching import in this file)
  globalService.unknownMethod();
}
