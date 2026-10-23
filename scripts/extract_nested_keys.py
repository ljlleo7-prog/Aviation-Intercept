import re
import json
import sys

def extract_js_object_string(js_content):
    # Find the object literal assigned to 'en' or 'zh'
    match = re.search(r'(?:const\s+(?:en|zh)\s*=\s*)?(\{[\s\S]*\});', js_content)
    if match:
        return match.group(1)
    return None

def make_json_compatible(js_object_string):
    # Step 1: Replace single quotes with double quotes
    temp_json_string = js_object_string.replace("'", '"')

    # Step 2: Quote unquoted keys
    temp_json_string = re.sub(r'([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:', r'\1"\2":', temp_json_string)
    temp_json_string = re.sub(r'([{,]\s*)(\d+)\s*:', r'\1"\2":', temp_json_string)

    # Step 3: Escape internal double quotes within string values
    def escape_quotes_in_value(match):
        s = match.group(0)
        if s.startswith('"') and s.endswith('"'):
            content = s[1:-1]
            # Escape any double quotes within the content that are not already escaped
            escaped_content = re.sub(r'(?<!\\)"', r'\"', content)
            return f'"{escaped_content}"'
        return s

    final_json_string = re.sub(r'"(?:[^"\\]|\\.)*"', escape_quotes_in_value, temp_json_string)

    return final_json_string

def get_all_keys(obj, prefix=''):
    keys = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            new_key = f"{prefix}.{k}" if prefix else k
            keys.append(new_key)
            keys.extend(get_all_keys(v, new_key))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            # For list items, we don't add the index as a key itself, but recurse into its content
            # The prefix will already contain the parent key, e.g., "narrative.phases.boarding.default"
            # and the item itself might be an object with keys like "title", "content".
            # So, if the item is a dict, its keys will be appended to "narrative.phases.boarding.default.0"
            keys.extend(get_all_keys(item, f"{prefix}.{i}"))
    return keys

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_nested_keys.py <file_path>", file=sys.stderr)
        sys.exit(1)
        
    file_path = sys.argv[1]
    
    with open(file_path, 'r', encoding='utf-8') as f:
        js_content = f.read()

    js_object_string = extract_js_object_string(js_content)
    
    if js_object_string:
        try:
            json_compatible_string = make_json_compatible(js_object_string)
            data = json.loads(json_compatible_string)
            all_keys = sorted(list(set(get_all_keys(data)))) # Use set to ensure uniqueness
            for key in all_keys:
                print(key)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from {file_path}: {e}", file=sys.stderr)
            print(f"Problematic string (first 500 chars): {json_compatible_string[:500]}...", file=sys.stderr)
            sys.exit(1)
        except Exception as e:
            print(f"An unexpected error occurred: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        print(f"Could not extract JavaScript object from {file_path}", file=sys.stderr)
        sys.exit(1)
