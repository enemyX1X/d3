# LIVIA intelligence runbook

This runbook describes the expected day-2 operations for the intelligence service.

## 1. Service start

```bash
npm run db:up
npm run migrate:intelligence
npm run dev:intelligence
```

Check the health endpoint:

```bash
curl http://127.0.0.1:4320/api/health
```

## 2. Register a source

Use the service token in the `Authorization` header and register a source:

```bash
curl -X POST http://127.0.0.1:4320/api/sources \
  -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://transport.karnataka.gov.in/notices",
    "source_name": "Karnataka Transport Department",
    "source_type": "GOVERNMENT",
    "authority_level": "OFFICIAL",
    "jurisdiction": "Karnataka"
  }'
```

## 3. Trigger a crawl

```bash
curl -X POST http://127.0.0.1:4320/api/crawl \
  -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceId": "<source_id>"
  }'
```

## 4. View detected changes

```bash
curl -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  "http://127.0.0.1:4320/api/changes?limit=20"
```

## 5. Investigate a specific change

```bash
curl -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  "http://127.0.0.1:4320/api/changes/<change_id>"
```

## 6. Search the evidence base

```bash
curl -X POST http://127.0.0.1:4320/api/search \
  -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Karnataka driving licence address proof",
    "limit": 5
  }'
```

## 7. Ask a time-aware question

```bash
curl -X POST http://127.0.0.1:4320/api/ask \
  -H "Authorization: Bearer <INTELLIGENCE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What changed for Karnataka driving licence rules?",
    "limit": 2
  }'
```

## 8. Common operational checks

- Verify the database connection is healthy.
- Confirm the source is still public and HTTPS-only.
- Inspect `robots.txt` and crawl permissions when a source is silently skipped.
- Review the change evidence for any unexpected diffs or false positives.
- Confirm the service token is not shared outside the deployment.

## 9. When a crawl fails

1. Check the source URL is still reachable and HTTPS.
2. Confirm the source is not blocked by `robots.txt`.
3. Inspect the source for redirects to private or reserved hosts.
4. Re-run the crawl after the domain is confirmed healthy.

## 10. Escalation

Escalate to the platform owner if:

- a source is repeatedly skipped or failing
- duplicate or conflicting change records appear
- significant evidence is missing from the source diff
- a public source appears to be violating the intended trust boundary
