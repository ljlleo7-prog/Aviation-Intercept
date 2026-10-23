
import json
import re
import os

def extract_keys_from_js(content_string, file_identifier=""):
    """Extracts translation keys from a given JavaScript locale content string."""
    try:
        content = content_string

        # Extract the main JavaScript object literal
        match = re.search(r'{[\s\S]*}', content)
        if not match:
            raise ValueError("Could not find a valid JavaScript object literal.")
        content = match.group(0)

        # Step 1: Quote unquoted keys
        # This regex looks for:
        # 1. A curly brace or comma (start of an object or after a key-value pair)
        # 2. Optional whitespace
        # 3. An unquoted key (alphanumeric starting with letter/underscore, or just digits)
        # 4. Optional whitespace
        # 5. A colon
        # And replaces it with: \1 (brace/comma) + "key"\2 (colon)
        json_content = re.sub(r'([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*:', r'\1"\2":', content)

        # Step 2: Replace single-quoted string values with double-quoted, escaping internal double quotes and backslashes
        def replace_single_quoted_strings(match):
            inner_content = match.group(1)
            # Escape backslashes first
            inner_content = inner_content.replace('\\', '\\\\')
            # Then escape double quotes
            escaped_inner_content = inner_content.replace('"', '\\"')
            return f'"{escaped_inner_content}"'

        # Apply this replacement to the entire content
        # This regex looks for a single quote, then anything that's not a single quote or an unescaped backslash,
        # or an escaped character, until the next single quote.
        json_content = re.sub(r"'((?:[^'\\]|\\.)*)'", replace_single_quoted_strings, json_content)

        # Debug print to see the content before JSON parsing
        # print(f"\n--- Debugging JSON content for {file_path} ---")
                # print(json_content[:500]) # Print first 500 characters for brevity
                # print(f"--- End Debugging JSON content for {file_path} ---\n")

        data = json.loads(json_content)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from {file_identifier}: {e}")
        print(f"Problematic content snippet around char {e.pos}: {json_content[max(0, e.pos-50):min(len(json_content), e.pos+50)]}")
        return set() # Return an empty set on error
    except Exception as e:
        print(f"An unexpected error occurred while processing {file_identifier}: {e}")
        return set()

    keys = set()
    def recurse_keys(obj, current_key=''):
        if isinstance(obj, dict):
            for k, v in obj.items():
                new_key = f"{current_key}.{k}" if current_key else k
                recurse_keys(v, new_key)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                new_key = f"{current_key}.{i}" if current_key else str(i)
                recurse_keys(item, new_key)
        else:
            keys.add(current_key)

    recurse_keys(data)
    return keys

def collect_string_values(obj, values=None):
    if values is None:
        values = set()
    if isinstance(obj, dict):
        for v in obj.values():
            collect_string_values(v, values)
    elif isinstance(obj, list):
        for item in obj:
            collect_string_values(item, values)
    elif isinstance(obj, str):
        values.add(obj.strip())
    return values

def find_hardcoded_strings(project_root, en_values, report_file):
    base_dir = os.path.join(project_root, 'src')
    exclude_dirs = {'node_modules', '.git', 'dist', 'build', 'coverage', 'public', 'docs', 'scripts'}

    # Patterns
    # JSX text between tags (no braces, minimal length)
    pat_jsx_text = re.compile(r'>\s*([A-Za-z][^<>{}]{2,})\s*<')
    # Attribute values likely user-facing
    pat_attr = re.compile(r'\b(placeholder|title|aria-label|alt|label)\s*=\s*([\'"])([^\'"{<>]{2,})\2')
    # React.createElement with literal text as child
    pat_create_el = re.compile(r'React\.createElement\([^,]+,\s*\{[^)]*\},\s*([\'"])([^\'"]{2,})\1\)')

    def is_candidate(text):
        s = text.strip()
        # Filters
        if len(s) < 2:
            return False
        if any(ch in s for ch in ['{', '}', '${', 'http://', 'https://']):
            return False
        if re.fullmatch(r'[\W_]+', s):
            return False
        if re.fullmatch(r'[0-9\s\.\-:]+', s):
            return False
        # Likely code-ish tokens
        if any(tok in s for tok in ['require(', 'import ', 'export ', 'const ', 'let ', 'var ', 'function ']):
            return False
        return True

    findings = []
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    # Skip locales themselves
                    if '/locales/' in file_path:
                        continue
                    for pattern in (pat_jsx_text, pat_attr, pat_create_el):
                        for m in pattern.finditer(content):
                            text = m.group(1) if pattern is pat_jsx_text else (m.group(3) if pattern is pat_attr else m.group(2))
                            if is_candidate(text):
                                # Compute line number
                                line_no = content.count('\n', 0, m.start()) + 1
                                normalized = text.strip()
                                status = 'KNOWN' if normalized in en_values else 'NEW'
                                findings.append((file_path, line_no, normalized, status))
                except Exception as e:
                    print(f"Error scanning for hardcoded strings in {file_path}: {e}")

    # Write report
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write('--- Hardcoded UI String Candidates (Heuristic) ---\n')
        f.write('Status NEW = not found in en.js values; KNOWN = value exists in en.js\n\n')
        for path, line, text, status in sorted(findings, key=lambda x: (x[0], x[1])):
            f.write(f'{path}:{line}: [{status}] {text}\n')
        f.write('\n--- End of Report ---\n')
    return findings

def extract_used_keys_from_code(project_root):
    """Extracts translation keys used with t() from all relevant code files."""
    used_keys = set()
    # Consider any namespace that has at least one dot (e.g., "foo.bar")
    # Support single, double, and backtick quotes (backticks only if static, no ${}).
    pattern_sq = re.compile(r"t\(\s*'([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+?)'\s*\)")
    pattern_dq = re.compile(r't\(\s*"([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+?)"\s*\)')
    pattern_bt = re.compile(r"t\(\s*`([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+?)`\s*\)")

    base_dir = os.path.join(project_root, 'src')
    exclude_dirs = {'node_modules', '.git', 'dist', 'build', 'coverage', 'public', 'docs', 'scripts'}

    for root, dirs, files in os.walk(base_dir):
        # Prune excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            if file.endswith(('.js', '.jsx', '.ts', '.tsx')):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        for pat in (pattern_sq, pattern_dq, pattern_bt):
                            matches = pat.findall(content)
                            for match in matches:
                                used_keys.add(match)
                except Exception as e:
                    print(f"Error reading or processing {file_path}: {e}")
    return used_keys

def compare_translations(en_keys, zh_keys, used_keys, report_file):
    """Compares translation keys and reports discrepancies to a file."""
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write("\n--- Translation Key Comparison Report ---\n")

        # Keys used in code but not defined in en.js
        not_in_en = used_keys - en_keys
        if not_in_en:
            f.write("\nKeys used in code but NOT found in en.js:\n")
            for key in sorted(list(not_in_en)):
                f.write(f"- {key}\n")
        else:
            f.write("\nAll keys used in code are found in en.js.\n")

        # Keys used in code but not defined in zh.js
        not_in_zh = used_keys - zh_keys
        if not_in_zh:
            f.write("\nKeys used in code but NOT found in zh.js:\n")
            for key in sorted(list(not_in_zh)):
                f.write(f"- {key}\n")
        else:
            f.write("\nAll keys used in code are found in zh.js.\n")

        f.write("\n--- End of Report ---\n")

if __name__ == "__main__":
    project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(os.path.join(project_root, "test-results"), exist_ok=True)
    
    # Read locale file contents directly
    with open(os.path.join(project_root, 'src', 'locales', 'en.js'), 'r', encoding='utf-8') as f:
        en_content = f.read()
    with open(os.path.join(project_root, 'src', 'locales', 'zh.js'), 'r', encoding='utf-8') as f:
        zh_content = f.read()

    en_defined_keys = extract_keys_from_js(en_content, "en.js")
    zh_defined_keys = extract_keys_from_js(zh_content, "zh.js")
    code_used_keys = extract_used_keys_from_code(project_root)

    report_file = os.path.join(project_root, 'test-results', 'translation_report.txt')
    compare_translations(en_defined_keys, zh_defined_keys, code_used_keys, report_file)
    print(f"\nTranslation report written to {report_file}")

    # Collect en.js values and scan for hardcoded UI strings
    try:
        # Reuse the conversion path to parse en.js content to JSON
        # by calling extract_keys_from_js and then parsing content again here
        # Instead, reconstruct JSON the same way as before to obtain values:
        # We already converted when extracting keys, but we didn't keep the object.
        # So convert again:
        match = re.search(r'{[\s\S]*}', en_content)
        json_content = re.sub(r'([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)\s*:', r'\1"\2":', match.group(0))
        json_content = re.sub(r"'((?:[^'\\]|\\.)*)'", lambda m: '"' + m.group(1).replace('\\', '\\\\').replace('"', '\\"') + '"', json_content)
        en_obj = json.loads(json_content)
        en_values = collect_string_values(en_obj)
    except Exception as e:
        en_values = set()
        print(f"Warning: Could not parse en.js values for hardcoded scan: {e}")

    hardcoded_report = os.path.join(project_root, 'test-results', 'translation_hardcoded_report.txt')
    find_hardcoded_strings(project_root, en_values, hardcoded_report)
    print(f"Hardcoded strings report written to {hardcoded_report}")
