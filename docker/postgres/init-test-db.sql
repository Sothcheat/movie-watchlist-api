-- Runs once when the pgdata volume is first created (docker-entrypoint-initdb.d).
-- The name must match DB_TEST_NAME in .env. Init scripts can't read .env, so keep them in sync.
CREATE DATABASE movie_watchlist_test;
