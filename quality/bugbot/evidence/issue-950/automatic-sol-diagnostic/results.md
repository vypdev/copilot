# Automatic #913 replay with GPT-6.1 Sol

The [preregistered commit](https://github.com/vypdev/copilot/commit/fdae8c2c201fb03d3592f87f30c757598af73a85) froze
the exact automatic second-call prompts before the six attempts. The
model-free controls delivered the form, parser and precision decoder
on both pinned trees. The packets retained the candidate and pinned diff
and took all source receipts from automatic retrieval. The six closed
sessions returned verdicts from those frozen prompts. [Protocol](preregistration.md) ·
[Packet snapshots](packets.json) · [Six-call journal](trials.jsonl)

| Revision | Expected verdict | Prepared supported | Automatic supported | Automatic outcomes |
| --- | --- | ---: | ---: | --- |
| H1 | `refuted` | 3/3 | 3/3 | 3 refuted |
| H2 | `confirmed` | 3/3 | 3/3 | 3 confirmed |

The counts require the expected verdict, a valid citation to the
decisive parser range, the exact anchor, proved budget and zero write
attempts. The prepared column uses the six published Sol results.
[Prepared reference](../prepared-diagnostic/results.md)

| Revision / repetition | Automatic trial | Verdict or failure | Decisive citation | Exact anchor | Wall ms | Gross input / output | Budget proved |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
| H1 / 1 | `5f9da9c8421b8bd8` | `refuted` | `r-f6a562c7730e7873deed8c87` | yes | 6,213 | 11,067 / 155 | yes |
| H1 / 2 | `722391d4f0e95097` | `refuted` | `r-f6a562c7730e7873deed8c87` | yes | 6,007 | 11,067 / 164 | yes |
| H1 / 3 | `9729bc7bb4afdb20` | `refuted` | `r-f6a562c7730e7873deed8c87` | yes | 6,526 | 11,065 / 165 | yes |
| H2 / 1 | `3bbd09301663a40d` | `confirmed` | `r-0b6a263daf7dceb6a698b076` | yes | 6,951 | 11,072 / 200 | yes |
| H2 / 2 | `215566d57e44aa3d` | `confirmed` | `r-0b6a263daf7dceb6a698b076` | yes | 6,814 | 11,074 / 167 | yes |
| H2 / 3 | `680bb76b3d15ef62` | `confirmed` | `r-0b6a263daf7dceb6a698b076` | yes | 5,971 | 11,072 / 160 | yes |

All six attempts completed with measured usage and zero writes. Each
packet is 9,884 bytes. The two prompts are 15,053 bytes each.

Sol reproduced both 3/3 prepared results. This meets the preregistered
criterion to try automatic recovery on a newly reserved pair.
Production activation remains disabled.
