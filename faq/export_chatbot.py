"""Validate reviewed Markdown FAQ entries and export retrieval JSONL; stdlib only."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
HEADER = re.compile(r'^### ([A-Z][A-Z0-9]*-\d{3}) \| (.+)$', re.MULTILINE)
META = re.compile(r'^<!-- faq: (.+) -->\s*$', re.MULTILINE)
STATUSES = {'implementation-confirmed', 'case-confirmed', 'provider-verification-required'}

def entries():
    registry = json.loads((ROOT / 'categories.json').read_text(encoding='utf-8'))
    result = []
    seen = set()
    for category in registry['categories']:
        path = (ROOT / category['faq_file']).resolve()
        if not path.is_relative_to(ROOT):
            raise ValueError('FAQ path escapes the library')
        source = path.read_text(encoding='utf-8')
        headers = list(HEADER.finditer(source))
        if not headers:
            raise ValueError(f'No entries in {path}')
        for index, header in enumerate(headers):
            identifier, question = header.groups()
            body = source[header.end():headers[index + 1].start() if index + 1 < len(headers) else len(source)]
            body = body.split('\n## ', 1)[0]  # exclude category headings and references
            meta = META.search(body)
            if not meta:
                raise ValueError(f'{identifier}: metadata missing')
            fields = json.loads(meta.group(1))
            if identifier in seen or fields['category'] != category['slug']:
                raise ValueError(f'{identifier}: duplicate ID or category mismatch')
            if fields['status'] not in STATUSES or not fields['audience']:
                raise ValueError(f'{identifier}: evidence status/audience invalid')
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', fields['last_reviewed']):
                raise ValueError(f'{identifier}: review date missing')
            answer = META.sub('', body).strip()
            if '**Answer:**' not in answer:
                raise ValueError(f'{identifier}: answer missing')
            seen.add(identifier)
            result.append({'id': identifier, 'question': question, **fields, 'answer': answer,
                           'source_path': str(path.relative_to(ROOT.parent)).replace('\\', '/')})
    for entry in result:
        for related in entry.get('related', []):
            if related not in seen:
                raise ValueError(f"{entry['id']}: unknown related ID {related}")
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Output JSONL file; omit for validation only')
    args = parser.parse_args()
    records = entries()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in records), encoding='utf-8')
    print(f"Validated {len(records)} FAQ entries across {len({r['category'] for r in records})} categories."
          + (f' Exported to {args.output}.' if args.output else ' No export written.'))

if __name__ == '__main__':
    main()
