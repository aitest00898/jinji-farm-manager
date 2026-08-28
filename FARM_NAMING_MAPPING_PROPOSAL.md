# Farm naming mapping proposal

This proposal is intentionally separate from the additive schema migration. It does not rewrite existing Production rows or Finance history.

| Existing legacy display name | Proposed caretaker | Proposed site name | Confidence | Migration action |
|---|---|---|---|---|
| 林志騰二林場 | 林志騰 | 二林場 | high | safe candidate for explicit assignment |
| 林志騰東勢場 | 林志騰 | 東勢場 | high | safe candidate for explicit assignment |
| 廖纔藝場 | 廖纔藝 | unknown | medium | preserve legacy display name; do not invent site |
| 陳駿榜龍潭場 | 陳駿榜 | 龍潭場 | high | safe candidate for explicit assignment |
| 洪秀美場 | 洪秀美 | unknown | medium | preserve legacy display name; do not invent site |
| 黃惠玲太保場 | 黃惠玲 | 太保場 | high | safe candidate for explicit assignment |
| 林楷威場 | 林楷威 | unknown | medium | preserve legacy display name; do not invent site |
| 洪嘉卿場 | 洪嘉卿 | unknown | medium | preserve legacy display name; do not invent site |

Migration 0013 adds nullable `site_name` and defaults the legacy-compatible structure mode to `whole_farm`. Existing names remain authoritative until a caretaker/site assignment is explicitly confirmed through the Web Admin flow. The resolver continues to support canonical names and existing trusted aliases such as `二林場` and `東勢場`.
