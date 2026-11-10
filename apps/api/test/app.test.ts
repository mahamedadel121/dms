import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AUTH_ONLY_KEY, PERMISSIONS_KEY, PUBLIC_KEY, Public } from '../src/common/decorators';
import { createTestApp, type TestApp } from './helpers';

describe('API skeleton', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp('skeleton');
  });
  afterAll(async () => {
    await t?.close();
  });

  it('GET /api/v1/health is public', async () => {
    const r = await t.http.get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
  });

  it('GET /api/v1/health/ready touches the database', async () => {
    const r = await t.http.get('/api/v1/health/ready');
    expect(r.status).toBe(200);
  });

  it('unknown route returns the error envelope', async () => {
    const r = await t.http.get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  });

  it('every route has permission metadata (Public, AuthOnly or RequirePermission)', () => {
    const discovery = new DiscoveryService(t.app.get(ModulesContainer));
    const scanner = new MetadataScanner();
    const reflector = new Reflector();
    const missing: string[] = [];
    let routes = 0;
    for (const w of discovery.getControllers()) {
      const instance = w.instance as object | null;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance);
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        if (Reflect.getMetadata('path', handler) === undefined) continue;
        routes++;
        const targets = [handler, w.metatype as object];
        const ok =
          reflector.getAllAndOverride(PUBLIC_KEY, targets as never) ||
          reflector.getAllAndOverride(AUTH_ONLY_KEY, targets as never) ||
          (reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets as never)?.length ?? 0) > 0;
        if (!ok) missing.push(`${w.metatype?.name}.${name}`);
      }
    }
    expect(routes).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('protected paths without a token are never 200', async () => {
    const r = await t.http.get('/api/v1/users');
    expect([401, 404]).toContain(r.status);
  });

  it('a valid session token authenticates (auth helper)', async () => {
    const h = await t.auth('admin');
    expect(h.Authorization).toMatch(/^Bearer /);
  });
});

describe('DI smoke: controller injects a service by type (SWC decorator metadata)', () => {
  @Injectable()
  class GreeterService {
    hello() {
      return 'hi';
    }
  }
  @Controller('smoke')
  class SmokeController {
    constructor(private readonly greeter: GreeterService) {}
    @Public()
    @Get()
    get() {
      return { msg: this.greeter.hello() };
    }
  }
  @Module({ controllers: [SmokeController], providers: [GreeterService] })
  class SmokeModule {}

  it('resolves GreeterService without @Inject', async () => {
    const m = await Test.createTestingModule({ imports: [SmokeModule] }).compile();
    expect(m.get(SmokeController).get()).toEqual({ msg: 'hi' });
    await m.close();
  });
});
