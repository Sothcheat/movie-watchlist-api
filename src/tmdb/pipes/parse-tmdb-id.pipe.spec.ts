import { BadRequestException } from '@nestjs/common';
import { MAX_TMDB_ID, ParseTmdbIdPipe } from './parse-tmdb-id.pipe.js';

describe('ParseTmdbIdPipe', () => {
  const pipe = new ParseTmdbIdPipe();

  it.each([1, 438631, MAX_TMDB_ID])('passes the id %i through', (id) => {
    expect(pipe.transform(id)).toBe(id);
  });

  it.each([
    ['zero', 0],
    ['a negative number', -1],
    ['a fraction', 1.5],
    ['NaN (what the global pipe makes of "abc")', NaN],
    ['Infinity', Infinity],
    ['one past the 32-bit maximum', MAX_TMDB_ID + 1],
    ['a string, i.e. the global pipe did not run', '123'],
    ['undefined', undefined],
    ['null', null],
    ['an object', { id: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() => pipe.transform(value)).toThrow(BadRequestException);
  });
});
