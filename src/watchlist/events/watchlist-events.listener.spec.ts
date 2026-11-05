import { Logger } from '@nestjs/common';
import { WatchlistEventsListener } from './watchlist-events.listener.js';
import { WatchlistItemCreatedEvent } from './watchlist-item-created.event.js';

describe('WatchlistEventsListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the new item on one line, escaping a title that contains a newline', () => {
    const log = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    new WatchlistEventsListener().handleItemCreated(
      new WatchlistItemCreatedEvent(
        'item-1',
        'user-1',
        42,
        'Evil\nFAKE LOG LINE',
      ),
    );

    const line = String(log.mock.calls[0][0]);
    expect(line).toBe(
      'User user-1 added "Evil\\nFAKE LOG LINE" (tmdb 42) as item item-1',
    );
    expect(line).not.toContain('\n');
  });
});
