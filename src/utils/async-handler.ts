import { NextFunction, Request, Response } from 'express';

type AsyncFn = (req: Request, res: Response) => Promise<unknown> | unknown;

export function asyncHandler(fn: AsyncFn) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}
