import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { setupSwagger } from './swagger.setup.js';

const appIn = (nodeEnv: string) =>
  ({ get: () => ({ get: () => nodeEnv }) }) as unknown as INestApplication;

describe('setupSwagger', () => {
  let setup: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setup = vi
      .spyOn(SwaggerModule, 'setup')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['development', 'test'])(
    'serves the docs at api/docs in %s',
    (env) => {
      setupSwagger(appIn(env));

      expect(setup).toHaveBeenCalledWith(
        'api/docs',
        expect.anything(),
        expect.any(Function),
      );
    },
  );

  it('registers nothing in production', () => {
    setupSwagger(appIn('production'));

    expect(setup).not.toHaveBeenCalled();
  });
});
