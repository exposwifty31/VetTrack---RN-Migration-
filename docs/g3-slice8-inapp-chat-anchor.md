# Engineering In-App Chat: How the Leaders Build It, and What Dan Should Build

> **Provenance:** owner-supplied research document, added 2026-08-08 as the **binding anchor for G3 Slice 8 (Shift chat)**. See `docs/G3-PLAN.md` §Slice 8 for the binding summary — which patterns bind the RN slice now vs which are vettrack-server evolution. This file is a full-text conversion of the source PDF ("Engineering In-App Chat: Patterns from the Leaders and a Staged Build Plan"); content preserved verbatim, formatting adapted to markdown.

## TL;DR

**The transferable pattern, not the infrastructure, is what matters.** Every large messaging system converges on the same handful of ideas Dan can implement today in Postgres + Socket.IO/SSE: server-assigned per-conversation ordering, client-generated IDs for idempotent at-least-once delivery, snapshot+delta sync on reconnect, ephemeral presence kept out of the database, and read-cursors instead of per-message read flags. Discord/Messenger/WhatsApp differ mainly in the storage engine and transport they swapped in once scale forced it — those are late-stage decisions, not starting points.

**Dan should NOT build** E2EE, a custom binary protocol, an Erlang/Elixir rewrite, or a wide-column store (Cassandra/ScyllaDB) now. Each solved a problem he does not have (billions of messages, hostile 2G networks, millions of concurrent sockets per node). A single Postgres instance with correct schema and indexes comfortably serves the low-tens-of-thousands of users a veterinary SaaS realistically reaches for years.

**Scaling is staged and trigger-driven, not a big-bang rewrite.** Stage 1 (now→~10k users): one Postgres + one Socket.IO node, sticky sessions, index on `(conversation_id, seq)`. Stage 2 (~10k–100k): Redis adapter for multi-node Socket.IO, Redis for presence, read replicas, table partitioning. Stage 3 (100k–1M+): dedicated gateway tier, queue-based fanout (Kafka/NATS), hot/cold storage split — and this is where you need a team, not just an architecture.

## Key Findings

1. **Transport: everyone ends up on one persistent connection, but the wire format is chosen for the worst network they serve.** Facebook Messenger deliberately picked MQTT-over-TLS in 2011 because it was designed for constrained devices — Facebook's own 2011 "Building Facebook Messenger" note explains: "we used a protocol called MQTT… MQTT is specifically designed for applications like sending telemetry data to and from space probes, so it is designed to use bandwidth and batteries sparingly." WhatsApp used a customized version of XMPP (known in reverse-engineering circles as "FunXMPP"), a byte-compressed slim variant. Discord runs a Gateway WebSocket with zlib streaming compression (JSON or binary ETF encoding), later moving to zstandard streaming to cut WebSocket traffic ~40%. Slack uses WebSocket plus an edge cache (Flannel). Telegram built MTProto, a three-layer custom protocol. **Lesson for Dan:** WebSocket (Socket.IO) and SSE are the correct, boring choices for a web/Capacitor app on decent networks. The custom protocols exist to shave bytes and battery for billions of mobile users on 2G — not a constraint Dan has.

2. **Storage: the relational database is the default, and the leaders only leave it under extreme, well-understood pressure.** Messenger ran on HBase from 2010, then migrated to MyRocks (RocksDB-as-MySQL-storage-engine); Meta reports it "reduced storage consumption by 90 percent without data loss," achieved via MyRocks plus Zstandard compression and cutting the replication factor from six to three. Slack shards MySQL horizontally with Vitess (per-workspace/channel sharding). Discord is the cautionary tale: MongoDB → Cassandra (2017) → ScyllaDB (2022), driven by hot partitions and JVM GC pauses at 177 nodes and trillions of messages. WhatsApp stores almost nothing server-side: it is a store-and-forward relay — its own Privacy Policy states "Once your messages are delivered, they are deleted from our servers." **Lesson for Dan:** Postgres is the right store and will remain so far past his current scale. Discord's own schema — partition by `(channel_id, time_bucket)`, sort by a time-encoded ID — is directly borrowable as a partitioning idea without adopting a wide-column DB.

3. **IDs and ordering: server-assigned, time-sortable identifiers with per-conversation ordering.** Discord uses Snowflake IDs (64-bit, timestamp-encoded, chronologically sortable) as both message ID and clustering key *(source: Sujeet Jaiswal)*. The universal pattern (documented in chat system-design write-ups) is a sequencer partitioned by `conversation_id` that assigns monotonic sequence numbers defining authoritative order, with client-generated IDs used only for idempotency/dedup *(source: Educative)*. **Lesson for Dan:** assign a monotonic `seq` per conversation in Postgres, and carry a client-generated UUID for dedup.

4. **Delivery semantics: at-least-once + idempotency + optimistic UI.** Clients insert the message locally (optimistic echo), send with a client-generated ID, and reconcile when the server acks with the authoritative ID/seq. Acks flow back as sent/delivered/read. Messenger's Iris queue is the archetype: a totally-ordered per-user queue of updates with independent cursors for "last update sent to the app" vs "last written to long-term storage," so a slow disk never blocks realtime delivery.

5. **Fanout and presence.** Two models: write-fanout (push a copy into each recipient's inbox on send) vs read-fanout (recipients read from a shared conversation log). Slack fans out over WebSockets with Flannel absorbing reconnection storms; Discord uses a single Elixir "guild" process per server as a routing point, fanning out to per-connection "session" processes. Presence is repeatedly cited as the hardest scaling problem because work grows super-linearly: every new user is both another sender and another recipient, so events × recipients multiply. Discord's fixes are instructive — "passive sessions" (users not actively viewing a large server) cut fanout work ~90%, and "relay" processes split fanout across BEAM processes, each handling up to 15,000 sessions. **Lesson for Dan:** for small conversations, read-fanout from a single messages table is simplest and correct. Keep presence/typing ephemeral and out of Postgres.

6. **Offline sync and multi-device: snapshot + delta over a resumable cursor.** Meta's "Building Mobile-First Infrastructure for Messenger" (Oct 2014) reports the new snapshot+delta sync protocol "decreased non-media data usage by 40%" and produced "an approximately 20% decrease in the number of people who experience errors when trying to send a message"; the initial snapshot is pulled once over HTTPS, then deltas are pushed over MQTT. WhatsApp's multi-device design gives each companion device its own identity and an independent, server-stored encrypted copy of app state so devices sync without the phone being online. **Lesson for Dan:** this is exactly "give me everything after seq X" — a cursor-based delta fetch on reconnect, which maps cleanly onto both his VetTrack outbox/SSE pattern and VetCrew Socket.IO rooms.

7. **Erlang/Elixir: the lesson is the model, not the language.** WhatsApp handled roughly 2M concurrent TCP connections per FreeBSD server with a process-per-connection model on the BEAM VM (the same infra later reported exceeding 8,000 cores and 70M Erlang messages/second); Discord runs Elixir for its gateway and has scaled a single guild past 1M concurrent users. **Lesson for Dan:** the transferable idea is "cheap isolated unit of concurrency per connection" — Node's event loop already gives him async I/O per socket. Rewriting into Elixir buys nothing until he is connection-bound on a single node, which is a Stage 3 problem.

8. **E2EE is a product decision with heavy cost.** WhatsApp and Messenger use the Signal protocol. It forces client-fanout (one ciphertext per device), complicates multi-device, search, and server-side moderation, and makes the server unable to read content. For veterinary team chat inside a hospital, server-side data is a feature (search, audit, compliance). **Skip E2EE.**

## Details

### Part 1 — How the leaders do it

**Facebook Messenger / Meta (msys, Iris, LightSpeed).**

- *Transport:* MQTT-over-TLS chosen in 2011 for persistent, low-power connections on poor mobile networks.
- *Sync:* The Iris service is a totally-ordered queue of messaging updates backed by MySQL + flash with semi-sync replication; separate pointers track "last sent to app" and "last written to storage," enabling a snapshot+delta client model. Switching from JSON to Thrift on the wire cut payloads ~50%; the new sync protocol cut non-media data 40% and send errors ~20%.
- *Storage:* HBase (used since 2010) → MyRocks (MySQL + RocksDB), reducing storage consumption 90% (via MyRocks + Zstandard compression + replication factor cut from six to three) with no data loss and no downtime.
- *Client:* Project LightSpeed rewrote the iOS app, reducing core code 84% — "from more than 1.7M lines to 360,000" — an effort Meta says "ultimately required more than 100 engineers." It uses SQLite as the on-device coordination layer, with a shared cross-app messaging engine (msys) later underpinning Messenger, Instagram Direct, and integration efforts. Instagram Direct migrated onto this shared Meta messaging infrastructure.

**WhatsApp.**

- *Transport:* customized XMPP ("FunXMPP").
- *Concurrency:* Erlang/BEAM, process-per-connection, ~2M concurrent connections per FreeBSD server; famously operated with a very small engineering team relative to its ~900M–1B users.
- *Storage:* store-and-forward relay — minimal server-side storage. Per WhatsApp's Privacy Policy: undelivered messages are kept "in encrypted form on our servers for up to 30 days as we try to deliver it. If a message is still undelivered after 30 days, we delete it," and "Once your messages are delivered, they are deleted from our servers."
- *Multi-device:* each companion device holds its own identity key; a per-account device list drives client-fanout (one ciphertext per device); app state syncs via a server-stored encrypted copy so companions work with the phone offline.
- *E2EE:* Signal protocol; 1:1 uses client-fanout, groups use Sender Keys.

**Discord.**

- *Transport:* Gateway WebSocket, zlib-stream compression (JSON or ETF binary); moved to zstandard streaming for ~40% less WebSocket traffic, combined with "Passive Sessions V2" that send deltas rather than full snapshots. (Notably, Discord experimented with compression dictionaries and decided against them — for message-create payloads the dictionary "actually made things worse" — so the win came from streaming + deltas, not dictionaries.)
- *Storage:* MongoDB → Cassandra (2017, 12 nodes) → by 2022, 177 Cassandra nodes and trillions of messages with hot-partition and GC-pause pain → ScyllaDB. Per Discord's 2023 write-up, this went "from running 177 Cassandra nodes to just 72 ScyllaDB nodes," each ScyllaDB node holding 9 TB (up from ~4 TB/Cassandra node), with historical-fetch p99 dropping from "40-125ms on Cassandra" to "a nice and chill 15ms p99" and insert p99 from "5-70ms" to "a steady 5ms." Reads are fronted by Rust "data services" that coalesce duplicate reads via consistent-hash routing on `channel_id`; the migration of trillions of messages took ~9 days using a Rust migrator.
- *Schema:* `PRIMARY KEY ((channel_id, bucket), message_id)` where `bucket` is a static 10-day time window (added to keep partitions under ~100MB) and `message_id` is a Snowflake, clustered descending.
- *Concurrency/fanout:* Elixir; one guild process per server routes to per-connection session processes; "passive" connections cut fanout ~90%; relays handle up to 15,000 sessions each; scaled a single guild past 1M concurrent (MidJourney).

**Slack.**

- *Transport:* WebSocket + Flannel, an application-level edge cache that lazy-loads workspace/user/channel data and absorbs reconnection storms; uses consistent hashing for team affinity and a pub/sub layer so each event is delivered to Flannel once and fanned out.
- *Storage:* MySQL sharded horizontally with Vitess (keyspaces → shards by key range; primary handles writes, replicas handle reads).
- *Fanout:* channel-server model with Kafka as a buffer in the fanout path at scale.

**Telegram.** MTProto, a bespoke three-layer protocol (high-level API/type language, crypto+auth layer, transport over TCP/HTTP/WS/UDP); cloud chats are server-stored (not E2EE); only "secret chats" are E2EE. Sessions are bound to the device/app, not a specific connection. Included as a contrast: heavy custom protocol engineering that a small team should not imitate.

**Signal.** The E2EE reference (Double Ratchet / X3DH). Relevant to Dan only as a decision point — the takeaway is that adopting it is a heavy product commitment that removes server-side capabilities.

### Part 2 — Patterns Dan can implement now (the core deliverable)

**Data model (Drizzle-style / SQL).** The design centers on server-assigned per-conversation `seq`, a client UUID for idempotency, and a read-cursor per participant.

```sql
-- conversations
CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,              -- hospital / tenant scoping
  kind          text NOT NULL,              -- 'dm' | 'group' | 'case'
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- monotonic per-conversation counter; the ordering point
  last_seq      bigint NOT NULL DEFAULT 0
);

-- participants (one row per user per conversation)
CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  user_id         text NOT NULL,            -- Clerk user id
  joined_at       timestamptz NOT NULL DEFAULT now(),
  last_read_seq   bigint NOT NULL DEFAULT 0,-- read cursor (NOT per-message flags)
  muted           boolean NOT NULL DEFAULT false,
  PRIMARY KEY (conversation_id, user_id)
);

-- messages
CREATE TABLE messages (
  conversation_id   uuid   NOT NULL REFERENCES conversations(id),
  seq               bigint NOT NULL,        -- server-assigned, per-conversation order
  id                uuid   NOT NULL DEFAULT gen_random_uuid(), -- server id
  client_message_id uuid   NOT NULL,        -- client-generated; dedup/idempotency
  sender_id         text   NOT NULL,
  body              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  edited_at         timestamptz,
  deleted_at        timestamptz,
  PRIMARY KEY (conversation_id, seq)
);

-- idempotency: a resend with the same client_message_id must not create a dup
CREATE UNIQUE INDEX messages_client_dedup
  ON messages (conversation_id, sender_id, client_message_id);

-- primary read path: "give me everything after seq X"
CREATE INDEX messages_conv_seq ON messages (conversation_id, seq);
```

**Assigning `seq` atomically (the ordering point).** Do not rely on a global `bigserial` for per-conversation order — a global sequence is monotonic across the table but has gaps and does not give you a clean per-conversation "everything after X." Increment the per-conversation counter inside the same transaction as the insert:

```sql
-- inside one transaction, per send:
WITH bumped AS (
  UPDATE conversations
     SET last_seq = last_seq + 1
   WHERE id = $conversation_id
  RETURNING last_seq
)
INSERT INTO messages (conversation_id, seq, client_message_id, sender_id, body)
SELECT $conversation_id, bumped.last_seq, $client_message_id, $sender_id, $body
FROM bumped
ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
RETURNING seq, id, created_at;
```

The `UPDATE … RETURNING` takes a row lock on the conversation, serializing concurrent sends within that conversation (fine — conversations are low-contention) while different conversations proceed in parallel. `ON CONFLICT DO NOTHING` makes a client retry idempotent; if it returns no row, re-select the existing message by `client_message_id` and ack that.

**Delivery semantics — at-least-once + optimistic UI (what Messenger/Slack clients do).**

1. Client generates `client_message_id` (UUID), inserts locally (optimistic echo), enqueues send.
2. Server runs the atomic insert above, returns `{client_message_id, seq, id, created_at}`.
3. Client reconciles the optimistic row by `client_message_id`, replacing its temporary sort key with the authoritative `seq`.
4. On timeout/reconnect the client resends the same `client_message_id`; the unique index guarantees no duplicate.

**Ordering — default choice.** Use the server-assigned per-conversation `seq` as the sort key and the source of truth. Keep `created_at` for display only. Do not order by client timestamps (clock skew) and do not order across conversations by a shared sequence. This is the Postgres-native equivalent of Discord's Snowflake-as-clustering-key idea.

**Sync / reconnect — cursor-based delta (maps to his existing transports).**

- Client persists the highest `seq` it has per conversation.
- On reconnect it sends `{conversation_id, after_seq}` and the server returns `messages WHERE conversation_id=$1 AND seq > $2 ORDER BY seq`.
- VetTrack (SSE/outbox): the outbox already **is** an ordered log — expose it as "events after cursor N"; the SSE `Last-Event-ID` header is literally the resumable cursor. Set the SSE event `id` to the seq (or a global outbox id) and the browser will send `Last-Event-ID` automatically on reconnect.
- VetCrew (Socket.IO): on `connection`, client emits `sync {conversation_id, after_seq}` per open conversation (or a single call with a map); join a Socket.IO room per conversation for live fanout. Socket.IO's Connection State Recovery can cover brief drops, but the seq-cursor resync is the durable backstop.

**Presence and typing — ephemeral, never in Postgres.**

- Stage 1: in-memory `Map<userId, {status, lastSeen}>` on the single node; broadcast presence/typing over the Socket.IO room.
- Debounce typing: emit `typing:start` at most once per ~3–5s, auto-expire client-side after ~5s of no keystrokes, and send `typing:stop` on send/blur. Never persist typing.
- Presence at Dan's scale is trivial; the reason it's called the hardest problem (Slack/Discord) is fanout amplification at millions of sessions — not relevant until Stage 3, and even then bounded by small hospital team sizes.

**Unread counts — derive, don't store a counter.** Unread = `messages.seq > participant.last_read_seq`. Read receipts update `last_read_seq` to the max seq the user has seen. This is trivial to reason about and cannot drift; stored per-user counters inevitably diverge under retries/races.

```sql
-- unread per conversation for a user
SELECT c.id,
       (SELECT count(*) FROM messages m
         WHERE m.conversation_id = c.id
           AND m.seq > p.last_read_seq
           AND m.sender_id <> p.user_id) AS unread
FROM conversation_participants p
JOIN conversations c ON c.id = p.conversation_id
WHERE p.user_id = $user_id;
```

**Push notifications (web push/VAPID he already has).**

- Only notify recipients who are **not** currently connected (check the presence map / Socket.IO room membership) and who aren't muted — mirrors WhatsApp/Messenger only pushing when the device isn't reachable on the live channel.
- Use the Web Push `topic` header (a.k.a. collapse key) set to the `conversation_id`, so multiple undelivered pushes for the same conversation coalesce to the latest one on the push service — the offline user sees one current notification, not 20 stale ones.
- Set `urgency` appropriately and a sensible `TTL`; treat a `410 Gone` response as "delete this subscription."

**Offline-first with Dexie (mirrors LightSpeed's on-device SQLite).**

- Dexie tables: `messages` (keyed by `[conversation_id+seq]` for synced, plus a `pending` store keyed by `client_message_id` for un-acked sends), `conversations`, `cursors`.
- Local echo: write to `pending` immediately, render optimistically.
- Pending-send queue: on connect, flush `pending` in order; on ack, move the row into `messages` under its authoritative `seq` and delete from `pending`, reconciling by `client_message_id`.
- On reconnect, run the seq-cursor delta per conversation to fill gaps. This is exactly the client architecture LightSpeed formalized: a local DB as the source of truth for the UI, kept in sync by deltas.

**What NOT to build now — and why each is premature.**

- **E2EE (Signal protocol):** removes server-side search, audit, and moderation that a veterinary/clinical product actually wants; forces client-fanout and complicates multi-device. Cost is high, benefit is negative for in-hospital team chat.
- **Custom binary protocol (MQTT/ETF/MTProto-style):** these buy battery/bandwidth for billions of mobile users on 2G. Socket.IO/SSE over TLS is fine; optimize payloads with plain compression if ever needed.
- **Erlang/Elixir rewrite:** only pays off when you are connection-bound per node (hundreds of thousands of sockets). Node handles Dan's concurrency for years; a rewrite is pure opportunity cost now.
- **Cassandra/ScyllaDB (wide-column):** Discord moved only at 177 nodes / trillions of messages. Postgres will serve Dan's message volume comfortably; adopting a wide-column store now means operating a distributed database with no payoff. Borrow the bucketing idea for partitioning inside Postgres instead.

### Part 3 — Scaling roadmap ("what do I need to reach their scale")

Thresholds are order-of-magnitude triggers, not hard limits; the trigger metric matters more than the user count.

**Stage 1 — now → ~10k users (single hospital / small teams).**

- One Postgres (Railway) + one Socket.IO node (VetCrew) / SSE (VetTrack). Sticky sessions at the load balancer (required for Socket.IO if any HTTP long-polling fallback is used; harmless otherwise).
- Schema above; index `(conversation_id, seq)`; per-conversation `seq` via `UPDATE … RETURNING`.
- Presence in-memory; unread derived from cursors.
- *Triggers to advance:* you run more than one app instance (for HA or CPU), OR a single Postgres primary approaches write/CPU limits, OR reconnection storms cause missed live events across instances.

**Stage 2 — ~10k → ~100k users.**

- Socket.IO Redis adapter so events emitted on one node reach clients on another via Redis pub/sub; keep sticky sessions. This is the single most important Stage 2 change and is a drop-in.
- Redis for presence (shared `SETEX` per user with TTL heartbeats) and for typing fanout.
- Postgres read replicas for history/backfill reads (send/writes stay on primary); route the "load older messages" and unread queries to replicas.
- Partition the messages table by time and/or hash of `conversation_id` (Postgres declarative partitioning) once the table is large enough that vacuum/index bloat hurts — this is Discord's bucket idea, applied natively:

```sql
CREATE TABLE messages (... ) PARTITION BY RANGE (created_at);
CREATE TABLE messages_2026_q1 PARTITION OF messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
```

- Add a durable per-recipient delivery/outbox if you need guaranteed delivery independent of Postgres write latency — a lightweight local echo of Messenger's Iris idea.
- *Triggers to advance:* a single Postgres primary can no longer hold the write rate even with partitioning/replicas; fanout to large rooms saturates a node; you need multi-region latency.

**Stage 3 — ~100k → 1M+ users (Discord/Messenger-class engineering begins).**

- **Separate the gateway (connection) tier from business logic** so you can scale sockets independently of app servers — the Slack Flannel / Discord session-process split.
- **Queue-based fanout** (Kafka or NATS) between "message accepted" and "deliver to N recipients/devices," decoupling send latency from fanout — Slack puts Kafka in this path; Messenger's Iris is the same idea.
- **Hot/cold storage split:** recent messages in a fast store/cache, older history in cheaper storage — Messenger's tiered Iris model (memory → queue backing store → long-term disk).
- **Consider a wide-column store (ScyllaDB)** only if Postgres sharding genuinely can't keep up and access patterns are strictly key-by-conversation — and expect to add a coalescing/data-service layer like Discord's Rust services to tame hot partitions.
- **Team-size reality check:** Discord, Slack, and Meta run these systems with dedicated infrastructure, database, and SRE teams. WhatsApp's famous small-team efficiency rested on a decade of Erlang/FreeBSD specialization and a deliberately tiny feature set. A solo founder should treat Stage 3 as "hire/partner before you architect." The architecture patterns transfer; the operational burden does not.

## Recommendations

1. **Ship the Stage 1 schema now, unchanged in shape through Stage 2.** The `(conversation_id, seq)` primary key, `client_message_id` unique index, and `last_read_seq` cursor are the decisions that are expensive to change later — get them right immediately. Everything else (Redis, replicas, partitioning) is additive.
2. **Standardize both apps on the same message contract.** VetTrack's SSE/outbox and VetCrew's Socket.IO should speak the identical `{conversation_id, seq, client_message_id, sender_id, body, created_at}` envelope and the identical "sync after_seq" call. This lets you share client reconcile logic and the Dexie layer across both.
3. **Implement optimistic send + reconcile-by-`client_message_id` and cursor sync before anything fancy.** These two patterns eliminate the majority of perceived-reliability bugs (dupes, out-of-order, lost-on-reconnect) and are what the big clients actually do.
4. **Keep presence/typing ephemeral from day one.** Never write them to Postgres, even now — it's the single most common self-inflicted scaling wound.
5. **Wire push notifications to presence + `topic` collapse keys now,** while the presence map is trivial to check. Retrofitting "only notify if offline" later is annoying.
6. **Add the Socket.IO Redis adapter the moment you run a second node** — don't wait for pain; it's a small change that prevents a confusing class of "message only reached half the users" bugs.

**Benchmarks that should change the plan:**

- Postgres primary CPU sustained >70%, or send-path p95 latency >150ms → begin Stage 2 (replicas, partitioning).
- More than one app node required → Redis adapter immediately.
- Message table > ~50–100M rows or vacuum/index maintenance windows growing → partition.
- Single-node concurrent sockets approaching tens of thousands, or fanout CPU-bound → split gateway tier (Stage 3).
- Postgres write throughput saturated despite sharding/replicas → evaluate queue-based fanout and, only then, a wide-column store.

## Caveats

- **Vendor/secondary sources:** several figures (Discord node counts and latencies, WhatsApp's 2M-connections-per-server, LightSpeed line counts) come from company engineering blogs and conference talks, which naturally present favorable results; treat exact numbers as directional. Where possible the primary posts are cited (Meta, Discord, Slack engineering blogs; WhatsApp's own policy).
- **Discord dropped compression dictionaries:** the ~40% WebSocket reduction came from zstandard streaming plus delta-only "Passive Sessions V2," not from dictionaries (which made message-create payloads worse). Don't cite dictionaries as the win.
- **"FunXMPP"** is community/reverse-engineering terminology, corroborated by WhatsApp's decompiled client class name, not an officially published WhatsApp term.
- **WhatsApp's Erlang/FreeBSD numbers** predate the Facebook acquisition's later Linux migration; the process-per-connection lesson stands, the exact OS tuning is historical.
- **Discord's storage journey is not a template to copy** — it's a warning about adopting distributed stores too eagerly and about hot partitions; the transferable pieces are Snowflake-style sortable IDs, bucketed partitioning, and a read-coalescing service.
- **Numbers move:** message-count and node-count figures are as of the cited posts (Discord's trillions of messages / 177→72 nodes as of the 2022–2023 migration write-ups) and will have grown since.
