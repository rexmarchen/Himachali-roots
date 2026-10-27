import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { errorMiddleware } from '../lib/http.js';

function fakeResponse() {
  const captured: { status?: number; body?: unknown } = {};
  const res = {
    locals: {},
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  };
  return { captured, res: res as unknown as Response };
}

describe('error middleware', () => {
  it('turns an uncaught ZodError into a 400 with field messages instead of a 500', () => {
    const { captured, res } = fakeResponse();
    let thrown: unknown;
    try {
      z.object({
        address: z.object({
          line1: z.string().min(4, 'Enter the street, building or landmark.'),
        }),
      }).parse({ address: { line1: '' } });
    } catch (error) {
      thrown = error;
    }

    errorMiddleware(
      thrown,
      { method: 'POST', path: '/api/seller/application/draft' } as Request,
      res,
      (() => undefined) as NextFunction,
    );

    expect(captured.status).toBe(400);
    expect(captured.body).toMatchObject({
      error: {
        code: 'invalid_request',
        fields: { 'address.line1': 'Enter the street, building or landmark.' },
      },
    });
  });
});
