export const TITLE = 'Copilot'

/** Default OpenCode model: provider/modelID (e.g. opencode/kimi-k2.5-free). Reuse for CLI, action and Ai fallbacks. */
export const OPENCODE_DEFAULT_MODEL = 'opencode/kimi-k2.5-free'

/** Timeout in ms for OpenCode HTTP requests (session create, message, diff). Agent calls can be slow (e.g. plan analyzing repo). */
export const OPENCODE_REQUEST_TIMEOUT_MS = 900_000

/** Max attempts for OpenCode requests (retries on failure). Applied by the capability transport policy. */
export const OPENCODE_MAX_RETRIES = 5

/** Delay in ms between OpenCode retry attempts. */
export const OPENCODE_RETRY_DELAY_MS = 2000

export const DEFAULT_IMAGE_CONFIG = {
    issue: {
        automatic: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm5iZHJydTJ4NGticXdxd3ZxYnZqNXdvaDQwOHdtb3o5NTRhdnRhOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LSX49vHf7JHGyGjrC0/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzRsNGFicndqMXgzMTVwdnhpeXNyZGsydXVxamV4eGxndWhna291OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ktcUyw6mBlMVa/200.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjkyeWVubngzM28xODFrbXZ4Nng3Y2hubmM4cXJqNGpic3Bheml0NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/M11UVCRrc0LUk/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExenQwNDJmZnZraDBzNXBoNjUwZjEzMzFlanMxcHVodmF4b3l3bDl2biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zrdUjl6N99nLq/200.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp"
        ],
        feature: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm5iZHJydTJ4NGticXdxd3ZxYnZqNXdvaDQwOHdtb3o5NTRhdnRhOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LSX49vHf7JHGyGjrC0/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExYmc4YWplZWs0Y2c3ZXNtbGpwZnQzdWpncmNjNXpodjg3MHdtbnJ5NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OMK7LRBedcnhm/200.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHBrYXpmd2poeGU5cWswbjRqNmJlZ2U2dWc0ejVpY3RpcXVuYTY3dSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/llKJGxQ1ESmac/giphy.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMnFleXV0MXZteGN6c2s2b3R3ZGc2cWY1aXB0Y3ZzNmpvZHhyNDVmNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/10FwycrnAkpshW/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHo0MjIzaGIycTRmeWFwZmp6bGExczJicXcyZTQxemsxaTY1b3V1NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QKkV58ufpV4ksJ1Okh/giphy.gif",
        ],
        bugfix: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExazc3OWszenA5c2FlemE3a25oNnlmZDBra3liMWRqMW82NzM2b2FveCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xPGkOAdiIO3Is/giphy.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExY3liaGF2NzI3bzM1YjRmdHFsaGdyenp4b3o3M3dqM3F0bGN5MHZtNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/npUpB306c3EStRK6qP/200.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZWh6d3Nld3E0MTF1eTk2YXFibnI3MTBhbGtpamJiemRwejl3YmkzMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/gU25raLP4pUu4/giphy.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmM1OWR0cnk5eXI0dXpoNWRzbmVseTVyd2l3MzdrOHZueHJ6bjhjMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yjKJaLB7DuG4/giphy.webp"
        ],
        hotfix: [
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2R0cjNxbXBjZjRjNmg4NmN3MGlhazVkNHJsaDkxMHZkY2hweGRtZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/pCU4bC7kC6sxy/200.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExenkyZTc3aDlweWl0MnI0cXJsZGptY3g0bzE2NTY1aWMyaHd4Y201ZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dbtDDSvWErdf2/giphy.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExM25ndGd2d3Uya3g3dnlnenJ1bjh0Y2NtNHdwZHY3Mjh2NnBmZDJpbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2xF8gHUf085aNyyAQR/200.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjU3bHdsc3FtamlyazBlbWppNHc3MTV3MW4xdHd2cWo4b2tzbTkwcSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/1EghTrigJJhq8/200.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmM1OWR0cnk5eXI0dXpoNWRzbmVseTVyd2l3MzdrOHZueHJ6bjhjMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yjKJaLB7DuG4/giphy.webp"
        ],
        release: [
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2NxcHEzam92enRtd29xc21pMHhmbHozMWljamF1cmt4cjhwZTI0ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/PApUm1HPVYlDNLoMmr/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNXU4dnhwOWVqZzc4NXVsdTY3c2I4Mm9lOHF1c253MDJya25zNXU0ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dxn6fRlTIShoeBr69N/giphy.webp",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN2bjJob3pxazE2NDJhbGE3ZWY5d2dzbDM4czgwZnA4ejlxY3ZqeCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/9D37RaHngWP7ZmmsEt/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnI0YTM2N2hwamd2dXYwNmN2MjRpYXIyN203cnNpbW13YjNhZGRhdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LYWPXVUNz30ze/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdW1jZ3F4ZGRwMWkyc3ZocHJ3aXhyb2FuZGppcnMyMWtsYXpjbDY2ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tXLpxypfSXvUc/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHRianpoOW51MzZ4Yjk3MmNpbmdseTJlb3o3dWVpYzJpazc5ZHNoayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/b85mPT4Usz7fq/giphy.gif",
        ],
        docs: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGRpZHJqYzRvZ25xcjR3ZXcwbzVudXF2Z2hsaHoyc2g1ZjZuam81YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eDArHBLT4aATKEKtCd/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2NubXR1b2M1dDQ2Z2UxYmk5bzltbHdudWI1emVzOGFlbDNsOGU1bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/wpgYasZ0tBrP4lCgS3/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmEyNzc3M2V0anp4d2JtOTJuMTZ2dXNnMmEyN3A4MmE0ZGpiaDhnNCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orifaQEOagjYJ1EXe/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjUyenc2eG5pZ3NjYzcyZXg2dDFndm5qZHRqMHk5amNoYjhhNnNvZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/7E8lI6TkLrvvAcPXso/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWFxcXZ3MTMxM3Bjd2IwNG43ZDJjdndreXNmdTVvZ2g3Z2Q4NjczMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3tJdi9wQQ10BD2H47g/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjFrejZmaHQ2Z2o1Y3B2MDl6cmU5bzNybG84eXFrYjBjZjV0dGFpeSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/fsXOS3oBboiYf6fSsY/giphy.gif",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHdhOHRianU1YmtrNHE0c2R2M2I2MTBzNnZhdnBrMW5ueG02eHF6OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieOEBYMAwTClHqM/giphy.gif",
        ],
        chore: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjFtNXY0ZXdmdGxkdno2Nm5odGk3Nzd3aTRuYnJtbDA4MXIxdHFhdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/10zsjaH4g0GgmY/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZG1sNXB6eTZvdDNtNzJwNXVxenNjendwaGgxb2xzNWI1dGNpdTVmZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NHHYRm7mAUQ6Y/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHd4bDJrc216YWpicDQ5emczdWF3bTk0dXYzeGQ4ajg2a3IyYjV6diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/FHEjBpiqMwSuA/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3d5b2U1Z3Jic3AxY2llYjQwNW5wODFpNWp5NHY0dGV5Z2cxdThkdCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/kLZNLNqUZ6bC0/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTNpZ2w0c3NrMmc0cmZobTd2eTM3YTRlM2lnbWpoZDUzNnRjdnNmZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NV4cSrRYXXwfUcYnua/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmFzZHNuODg0dDRheGt0aGU2bjVvd2xiNDI1bWFmYTVsbHJ2eHI2dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XaAbmtzzz35IgW3Ntn/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExYWM2OHkzYmNkajZxa204Njg0bmQzaWp1M3NobnJjbWxyYWJrbDNnciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OiwOPq0fFqqyainyMu/giphy.gif",
        ],
    },
    pullRequest: {
        automatic: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm5iZHJydTJ4NGticXdxd3ZxYnZqNXdvaDQwOHdtb3o5NTRhdnRhOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LSX49vHf7JHGyGjrC0/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExYzRsNGFicndqMXgzMTVwdnhpeXNyZGsydXVxamV4eGxndWhna291OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/ktcUyw6mBlMVa/200.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjkyeWVubngzM28xODFrbXZ4Nng3Y2hubmM4cXJqNGpic3Bheml0NSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/M11UVCRrc0LUk/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExenQwNDJmZnZraDBzNXBoNjUwZjEzMzFlanMxcHVodmF4b3l3bDl2biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/zrdUjl6N99nLq/200.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp",
        ],
        feature: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm5iZHJydTJ4NGticXdxd3ZxYnZqNXdvaDQwOHdtb3o5NTRhdnRhOCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LSX49vHf7JHGyGjrC0/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExYmc4YWplZWs0Y2c3ZXNtbGpwZnQzdWpncmNjNXpodjg3MHdtbnJ5NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OMK7LRBedcnhm/200.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHBrYXpmd2poeGU5cWswbjRqNmJlZ2U2dWc0ejVpY3RpcXVuYTY3dSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/llKJGxQ1ESmac/giphy.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExMnFleXV0MXZteGN6c2s2b3R3ZGc2cWY1aXB0Y3ZzNmpvZHhyNDVmNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/10FwycrnAkpshW/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHo0MjIzaGIycTRmeWFwZmp6bGExczJicXcyZTQxemsxaTY1b3V1NiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/QKkV58ufpV4ksJ1Okh/giphy.gif",
        ],
        bugfix: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExazc3OWszenA5c2FlemE3a25oNnlmZDBra3liMWRqMW82NzM2b2FveCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/xPGkOAdiIO3Is/giphy.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExY3liaGF2NzI3bzM1YjRmdHFsaGdyenp4b3o3M3dqM3F0bGN5MHZtNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/npUpB306c3EStRK6qP/200.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExZWh6d3Nld3E0MTF1eTk2YXFibnI3MTBhbGtpamJiemRwejl3YmkzMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/gU25raLP4pUu4/giphy.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmM1OWR0cnk5eXI0dXpoNWRzbmVseTVyd2l3MzdrOHZueHJ6bjhjMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yjKJaLB7DuG4/giphy.webp",
        ],
        hotfix: [
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmozN3plMWNiYjZoemh6N2RmeTB1MG9ieHlqYTJsb3BrZmNoY3h0dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/stv1Dliu5TrMs/giphy.webp",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2R0cjNxbXBjZjRjNmg4NmN3MGlhazVkNHJsaDkxMHZkY2hweGRtZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/pCU4bC7kC6sxy/200.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExenkyZTc3aDlweWl0MnI0cXJsZGptY3g0bzE2NTY1aWMyaHd4Y201ZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dbtDDSvWErdf2/giphy.webp",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExM25ndGd2d3Uya3g3dnlnenJ1bjh0Y2NtNHdwZHY3Mjh2NnBmZDJpbyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2xF8gHUf085aNyyAQR/200.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjU3bHdsc3FtamlyazBlbWppNHc3MTV3MW4xdHd2cWo4b2tzbTkwcSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/1EghTrigJJhq8/200.webp",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExdmM1OWR0cnk5eXI0dXpoNWRzbmVseTVyd2l3MzdrOHZueHJ6bjhjMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/12yjKJaLB7DuG4/giphy.webp",
        ],
        release: [
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2NxcHEzam92enRtd29xc21pMHhmbHozMWljamF1cmt4cjhwZTI0ayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/PApUm1HPVYlDNLoMmr/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNXU4dnhwOWVqZzc4NXVsdTY3c2I4Mm9lOHF1c253MDJya25zNXU0ZyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/dxn6fRlTIShoeBr69N/giphy.webp",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExbXN2bjJob3pxazE2NDJhbGE3ZWY5d2dzbDM4czgwZnA4ejlxY3ZqeCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/9D37RaHngWP7ZmmsEt/giphy.webp",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnI0YTM2N2hwamd2dXYwNmN2MjRpYXIyN203cnNpbW13YjNhZGRhdyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LYWPXVUNz30ze/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdW1jZ3F4ZGRwMWkyc3ZocHJ3aXhyb2FuZGppcnMyMWtsYXpjbDY2ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tXLpxypfSXvUc/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHRianpoOW51MzZ4Yjk3MmNpbmdseTJlb3o3dWVpYzJpazc5ZHNoayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/b85mPT4Usz7fq/giphy.gif",
        ],
        docs: [
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGRpZHJqYzRvZ25xcjR3ZXcwbzVudXF2Z2hsaHoyc2g1ZjZuam81YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/eDArHBLT4aATKEKtCd/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2NubXR1b2M1dDQ2Z2UxYmk5bzltbHdudWI1emVzOGFlbDNsOGU1bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/wpgYasZ0tBrP4lCgS3/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExMmEyNzc3M2V0anp4d2JtOTJuMTZ2dXNnMmEyN3A4MmE0ZGpiaDhnNCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orifaQEOagjYJ1EXe/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZjUyenc2eG5pZ3NjYzcyZXg2dDFndm5qZHRqMHk5amNoYjhhNnNvZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/7E8lI6TkLrvvAcPXso/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExaWFxcXZ3MTMxM3Bjd2IwNG43ZDJjdndreXNmdTVvZ2g3Z2Q4NjczMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3tJdi9wQQ10BD2H47g/giphy.gif",
            "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjFrejZmaHQ2Z2o1Y3B2MDl6cmU5bzNybG84eXFrYjBjZjV0dGFpeSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/fsXOS3oBboiYf6fSsY/giphy.gif",
            "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHdhOHRianU1YmtrNHE0c2R2M2I2MTBzNnZhdnBrMW5ueG02eHF6OSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieOEBYMAwTClHqM/giphy.gif",
        ],
        chore: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNjFtNXY0ZXdmdGxkdno2Nm5odGk3Nzd3aTRuYnJtbDA4MXIxdHFhdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/10zsjaH4g0GgmY/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZG1sNXB6eTZvdDNtNzJwNXVxenNjendwaGgxb2xzNWI1dGNpdTVmZCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NHHYRm7mAUQ6Y/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHd4bDJrc216YWpicDQ5emczdWF3bTk0dXYzeGQ4ajg2a3IyYjV6diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/FHEjBpiqMwSuA/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3d5b2U1Z3Jic3AxY2llYjQwNW5wODFpNWp5NHY0dGV5Z2cxdThkdCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/kLZNLNqUZ6bC0/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbTNpZ2w0c3NrMmc0cmZobTd2eTM3YTRlM2lnbWpoZDUzNnRjdnNmZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NV4cSrRYXXwfUcYnua/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmFzZHNuODg0dDRheGt0aGU2bjVvd2xiNDI1bWFmYTVsbHJ2eHI2dyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XaAbmtzzz35IgW3Ntn/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExYWM2OHkzYmNkajZxa204Njg0bmQzaWp1M3NobnJjbWxyYWJrbDNnciZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/OiwOPq0fFqqyainyMu/giphy.gif",
        ],
    },
    commit: {
        automatic: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        feature: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        bugfix: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        hotfix: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        release: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        docs: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ],
        chore: [
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExdWp2OGJ5ZmczaGhiMmVxdjRxMWZnYnRrNW5uemlmd2Ewam1nNGd0aSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/2XflxzEtr4EPIEzioLu/giphy.gif",
            "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaTkzeTFveHd6N3Fubm8yZDlpYTVuMnp0bm1rODQyZDdpbTF4YzAxaiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/n2IPMYMthV0m4/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3BmNXV1YzZod2NkYjZ3aTE1Z3BwMWJ0ZG9uMXN0bm5pbDQ4ajBvaCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3WxRbhsvQjYw8/giphy.gif",
            "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWs5YXEyajhoNWI1aHdxeHNwcmt2czY2NW1mNjZrbnViYm9reXJsZiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/loLqo6AzjUcMdjS1Jj/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExdHh5MndyMzBmY3c3bDRxeGhpanF2ZjIycGpmbzlkMDV5cDJkeXhjMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3orieQDBZVlki2mJLW/giphy.gif",
            "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGdkaHFsMTlzM2ZuY3R5ZXJpZmo3cHRqZWJieXVlOHQwc2F3eGVrdSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/tELuxgGsoL62ihEtQs/giphy.gif",
        ]
    }
};

export const WORKFLOW_STATUS = {
    IN_PROGRESS: 'in_progress',
    QUEUED: 'queued',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    SKIPPED: 'skipped',
    TIMED_OUT: 'timed_out',
};

export const WORKFLOW_ACTIVE_STATUSES = [WORKFLOW_STATUS.IN_PROGRESS, WORKFLOW_STATUS.QUEUED];

export const INPUT_KEYS = {
    // Debug
    DEBUG: 'debug',

    // Welcome
    WELCOME_TITLE: 'welcome-title',
    WELCOME_MESSAGES: 'welcome-messages',

    // Single action
    SINGLE_ACTION: 'single-action',
    SINGLE_ACTION_ISSUE: 'single-action-issue',
    SINGLE_ACTION_VERSION: 'single-action-version',
    SINGLE_ACTION_TITLE: 'single-action-title',
    SINGLE_ACTION_CHANGELOG: 'single-action-changelog',

    // Tokens
    TOKEN: 'token',

    // Agent selection
    AGENT_PROVIDER: 'agent-provider',
    AGENT_MODEL_PROVIDER: 'agent-model-provider',

    AGENT_MODEL: 'agent-model',
    AGENT_COMMAND: 'agent-command',
    FINDINGS_PROVIDER: 'findings-provider',

    FINDINGS_MODEL: 'findings-model',
    FINDINGS_COMMAND: 'findings-command',
    FIXER_PROVIDER: 'fixer-provider',

    FIXER_MODEL: 'fixer-model',
    FIXER_COMMAND: 'fixer-command',

    // AI provider configuration
    OPENCODE_MODEL: 'opencode-model',

    AI_PULL_REQUEST_DESCRIPTION: 'ai-pull-request-description',
    AI_MEMBERS_ONLY: 'ai-members-only',
    AI_IGNORE_FILES: 'ai-ignore-files',
    AI_INCLUDE_REASONING: 'ai-include-reasoning',
    BUGBOT_SEVERITY: 'bugbot-severity',
    BUGBOT_COMMENT_LIMIT: 'bugbot-comment-limit',
    BUGBOT_FIX_VERIFY_COMMANDS: 'bugbot-fix-verify-commands',

    // Projects
    PROJECT_IDS: 'project-ids',
    PROJECT_COLUMN_ISSUE_CREATED: 'project-column-issue-created',
    PROJECT_COLUMN_PULL_REQUEST_CREATED: 'project-column-pull-request-created',
    PROJECT_COLUMN_ISSUE_IN_PROGRESS: 'project-column-issue-in-progress',
    PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS: 'project-column-pull-request-in-progress',

    // Images
    IMAGES_ON_ISSUE: 'images-on-issue',
    IMAGES_ON_PULL_REQUEST: 'images-on-pull-request',
    IMAGES_ON_COMMIT: 'images-on-commit',
    IMAGES_ISSUE_AUTOMATIC: 'images-issue-automatic',
    IMAGES_ISSUE_FEATURE: 'images-issue-feature',
    IMAGES_ISSUE_BUGFIX: 'images-issue-bugfix',
    IMAGES_ISSUE_DOCS: 'images-issue-docs',
    IMAGES_ISSUE_CHORE: 'images-issue-chore',
    IMAGES_ISSUE_RELEASE: 'images-issue-release',
    IMAGES_ISSUE_HOTFIX: 'images-issue-hotfix',
    IMAGES_PULL_REQUEST_AUTOMATIC: 'images-pull-request-automatic',
    IMAGES_PULL_REQUEST_FEATURE: 'images-pull-request-feature',
    IMAGES_PULL_REQUEST_BUGFIX: 'images-pull-request-bugfix',
    IMAGES_PULL_REQUEST_RELEASE: 'images-pull-request-release',
    IMAGES_PULL_REQUEST_HOTFIX: 'images-pull-request-hotfix',
    IMAGES_PULL_REQUEST_DOCS: 'images-pull-request-docs',
    IMAGES_PULL_REQUEST_CHORE: 'images-pull-request-chore',
    IMAGES_COMMIT_AUTOMATIC: 'images-commit-automatic',
    IMAGES_COMMIT_FEATURE: 'images-commit-feature',
    IMAGES_COMMIT_BUGFIX: 'images-commit-bugfix',
    IMAGES_COMMIT_RELEASE: 'images-commit-release',
    IMAGES_COMMIT_HOTFIX: 'images-commit-hotfix',
    IMAGES_COMMIT_DOCS: 'images-commit-docs',
    IMAGES_COMMIT_CHORE: 'images-commit-chore',

    // Workflows
    RELEASE_WORKFLOW: 'release-workflow',
    HOTFIX_WORKFLOW: 'hotfix-workflow',

    // Emoji
    EMOJI_LABELED_TITLE: 'emoji-labeled-title',
    BRANCH_MANAGEMENT_EMOJI: 'branch-management-emoji',

    // Labels
    BRANCH_MANAGEMENT_LAUNCHER_LABEL: 'branch-management-launcher-label',
    BUGFIX_LABEL: 'bugfix-label',
    BUG_LABEL: 'bug-label',
    HOTFIX_LABEL: 'hotfix-label',
    ENHANCEMENT_LABEL: 'enhancement-label',
    FEATURE_LABEL: 'feature-label',
    RELEASE_LABEL: 'release-label',
    QUESTION_LABEL: 'question-label',
    HELP_LABEL: 'help-label',
    DEPLOY_LABEL: 'deploy-label',
    DEPLOYED_LABEL: 'deployed-label',
    DOCS_LABEL: 'docs-label',
    DOCUMENTATION_LABEL: 'documentation-label',
    CHORE_LABEL: 'chore-label',
    MAINTENANCE_LABEL: 'maintenance-label',
    PRIORITY_HIGH_LABEL: 'priority-high-label',
    PRIORITY_MEDIUM_LABEL: 'priority-medium-label',
    PRIORITY_LOW_LABEL: 'priority-low-label',
    PRIORITY_NONE_LABEL: 'priority-none-label',
    SIZE_XXL_LABEL: 'size-xxl-label',
    SIZE_XL_LABEL: 'size-xl-label',
    SIZE_L_LABEL: 'size-l-label',
    SIZE_M_LABEL: 'size-m-label',
    SIZE_S_LABEL: 'size-s-label',
    SIZE_XS_LABEL: 'size-xs-label',

    // Issue Types
    ISSUE_TYPE_BUG: 'issue-type-bug',
    ISSUE_TYPE_BUG_DESCRIPTION: 'issue-type-bug-description',
    ISSUE_TYPE_BUG_COLOR: 'issue-type-bug-color',

    ISSUE_TYPE_HOTFIX: 'issue-type-hotfix',
    ISSUE_TYPE_HOTFIX_DESCRIPTION: 'issue-type-hotfix-description',
    ISSUE_TYPE_HOTFIX_COLOR: 'issue-type-hotfix-color',

    ISSUE_TYPE_FEATURE: 'issue-type-feature',
    ISSUE_TYPE_FEATURE_DESCRIPTION: 'issue-type-feature-description',
    ISSUE_TYPE_FEATURE_COLOR: 'issue-type-feature-color',

    ISSUE_TYPE_DOCUMENTATION: 'issue-type-documentation',
    ISSUE_TYPE_DOCUMENTATION_DESCRIPTION: 'issue-type-documentation-description',
    ISSUE_TYPE_DOCUMENTATION_COLOR: 'issue-type-documentation-color',

    ISSUE_TYPE_MAINTENANCE: 'issue-type-maintenance',
    ISSUE_TYPE_MAINTENANCE_DESCRIPTION: 'issue-type-maintenance-description',
    ISSUE_TYPE_MAINTENANCE_COLOR: 'issue-type-maintenance-color',

    ISSUE_TYPE_RELEASE: 'issue-type-release',
    ISSUE_TYPE_RELEASE_DESCRIPTION: 'issue-type-release-description',
    ISSUE_TYPE_RELEASE_COLOR: 'issue-type-release-color',

    ISSUE_TYPE_QUESTION: 'issue-type-question',
    ISSUE_TYPE_QUESTION_DESCRIPTION: 'issue-type-question-description',
    ISSUE_TYPE_QUESTION_COLOR: 'issue-type-question-color',

    ISSUE_TYPE_HELP: 'issue-type-help',
    ISSUE_TYPE_HELP_DESCRIPTION: 'issue-type-help-description',
    ISSUE_TYPE_HELP_COLOR: 'issue-type-help-color',

    ISSUE_TYPE_TASK: 'issue-type-task',
    ISSUE_TYPE_TASK_DESCRIPTION: 'issue-type-task-description',
    ISSUE_TYPE_TASK_COLOR: 'issue-type-task-color',

    // Locale
    ISSUES_LOCALE: 'issues-locale',
    PULL_REQUESTS_LOCALE: 'pull-requests-locale',

    // Size Thresholds
    SIZE_XXL_THRESHOLD_LINES: 'size-xxl-threshold-lines',
    SIZE_XXL_THRESHOLD_FILES: 'size-xxl-threshold-files',
    SIZE_XXL_THRESHOLD_COMMITS: 'size-xxl-threshold-commits',
    SIZE_XL_THRESHOLD_LINES: 'size-xl-threshold-lines',
    SIZE_XL_THRESHOLD_FILES: 'size-xl-threshold-files',
    SIZE_XL_THRESHOLD_COMMITS: 'size-xl-threshold-commits',
    SIZE_L_THRESHOLD_LINES: 'size-l-threshold-lines',
    SIZE_L_THRESHOLD_FILES: 'size-l-threshold-files',
    SIZE_L_THRESHOLD_COMMITS: 'size-l-threshold-commits',
    SIZE_M_THRESHOLD_LINES: 'size-m-threshold-lines',
    SIZE_M_THRESHOLD_FILES: 'size-m-threshold-files',
    SIZE_M_THRESHOLD_COMMITS: 'size-m-threshold-commits',
    SIZE_S_THRESHOLD_LINES: 'size-s-threshold-lines',
    SIZE_S_THRESHOLD_FILES: 'size-s-threshold-files',
    SIZE_S_THRESHOLD_COMMITS: 'size-s-threshold-commits',
    SIZE_XS_THRESHOLD_LINES: 'size-xs-threshold-lines',
    SIZE_XS_THRESHOLD_FILES: 'size-xs-threshold-files',
    SIZE_XS_THRESHOLD_COMMITS: 'size-xs-threshold-commits',

    // Branches
    MAIN_BRANCH: 'main-branch',
    DEVELOPMENT_BRANCH: 'development-branch',
    FEATURE_TREE: 'feature-tree',
    BUGFIX_TREE: 'bugfix-tree',
    HOTFIX_TREE: 'hotfix-tree',
    RELEASE_TREE: 'release-tree',
    DOCS_TREE: 'docs-tree',
    CHORE_TREE: 'chore-tree',

    // Commit
    COMMIT_PREFIX_TRANSFORMS: 'commit-prefix-transforms',

    // Issue
    BRANCH_MANAGEMENT_ALWAYS: 'branch-management-always',
    REOPEN_ISSUE_ON_PUSH: 'reopen-issue-on-push',
    DESIRED_ASSIGNEES_COUNT: 'desired-assignees-count',

    // Pull Request
    PULL_REQUEST_DESIRED_ASSIGNEES_COUNT: 'desired-assignees-count',
    PULL_REQUEST_DESIRED_REVIEWERS_COUNT: 'desired-reviewers-count',
    PULL_REQUEST_MERGE_TIMEOUT: 'merge-timeout',

} as const;

export const ERRORS = {
    GIT_REPOSITORY_NOT_FOUND: '❌ Git repository not found'
} as const;

export const ACTIONS = {
    DEPLOYED: 'deployed_action',
    PUBLISH_GITHUB_ACTION: 'publish_github_action',
    CREATE_RELEASE: 'create_release',
    CREATE_TAG: 'create_tag',
    THINK: 'think_action',
    INITIAL_SETUP: 'initial_setup',
    CHECK_PROGRESS: 'check_progress_action',
    DETECT_POTENTIAL_PROBLEMS: 'detect_potential_problems_action',
    RECOMMEND_STEPS: 'recommend_steps_action',
} as const;

/** Hidden HTML comment prefix for bugbot findings (issue/PR comments). Format: <!-- copilot-bugbot finding_id:"id" resolved:true|false --> */
export const BUGBOT_MARKER_PREFIX = 'copilot-bugbot';

/** Max number of individual bugbot comments to create per issue/PR. Excess findings get one summary comment suggesting to review locally. */
export const BUGBOT_MAX_COMMENTS = 20;

/** Minimum severity to publish (findings below this are dropped). Order: high > medium > low > info. */
export const BUGBOT_MIN_SEVERITY: 'info' | 'low' | 'medium' | 'high' = 'low';

export const PROMPTS = {
} as const; 
