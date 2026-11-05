import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

export enum WatchPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

/**
 * One movie on one user's watchlist. Two kinds of columns:
 * - TMDB snapshot (title ... release_date): fetched by the server, never sent by the client,
 *   and re-fetched by the nightly refresh job before it is 6 months old (TMDB's cache limit).
 * - The user's own state (watched ... priority): the only fields PATCH can change.
 */
@Entity('watchlist_items')
@Unique('UQ_watchlist_items_user_movie', ['userId', 'tmdbId'])
@Check('CHK_watchlist_items_rating', '"rating" BETWEEN 1 AND 10')
export class WatchlistItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Covered by the unique (user_id, tmdb_id) index, which leads with user_id. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'tmdb_id', type: 'integer' })
  tmdbId: number;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  overview: string | null;

  @Column({ name: 'poster_path', type: 'text', nullable: true })
  posterPath: string | null;

  /** Hydrated by TypeORM as a 'YYYY-MM-DD' string, not a Date. */
  @Column({ name: 'release_date', type: 'date', nullable: true })
  releaseDate: string | null;

  /** When the snapshot was last fetched from TMDB. Indexed for the refresh job. */
  @Index()
  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt: Date;

  @Column({ type: 'boolean', default: false })
  watched: boolean;

  /** Set when `watched` flips to true, cleared when it flips back. */
  @Column({ name: 'watched_at', type: 'timestamptz', nullable: true })
  watchedAt: Date | null;

  @Column({ type: 'smallint', nullable: true })
  rating: number | null;

  @Column({
    type: 'enum',
    enum: WatchPriority,
    enumName: 'watchlist_priority',
    default: WatchPriority.Medium,
  })
  priority: WatchPriority;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
