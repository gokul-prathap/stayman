import asyncio,json,sys
from pathlib import Path
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright
root=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('after',root/'qa/performance-after.py');audit=module_from_spec(spec);spec.loader.exec_module(audit)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge')
  try:
   result=await audit.run(browser,100,extended=True)
   assert not result['errors'],result['errors']
   output=root/(sys.argv[1] if len(sys.argv)>1 else 'qa/workspace-smoke-results.json')
   output.write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
  finally:await browser.close()
asyncio.run(main())
