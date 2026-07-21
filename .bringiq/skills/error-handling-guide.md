---
name: error-handling-guide
displayName: Error Handling Guide
description: Best practices for error handling
category: quality-assurance
version: 1.0.0
---

# Error Handling Guide

## Controller Error Handling
```typescript
async create(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.create(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Operation failed', { error });
    next(error);
  }
}
```

## Service Error Handling
- Throw descriptive errors
- Include context in error messages
- Log errors with structured data

## Custom Errors
- Use Error subclasses for specific error types
- Include error codes for API responses

## Logging
- Use Winston logger
- Include context object
- Never log sensitive data

