---
name: Video export timing
description: Browser capture timing can differ from the composition's declared duration.
---

Do not truncate a browser-recorded video solely to its declared composition duration. Wait for the recording completion marker, then inspect the final frame and actual capture timestamps before encoding.

**Why:** In this environment a complete 60-second composition produced a longer capture; truncating it to 60 seconds removed the closing result.

**How to apply:** Preserve the complete scene sequence and normalize capture timestamps to the requested duration when necessary. Check that the closing caption and result remain in the exported file.