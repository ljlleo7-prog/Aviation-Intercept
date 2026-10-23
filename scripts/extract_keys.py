import re
import sys

def extract_translation_keys(grep_output):
    keys = set()
    # Regex to find t('key') or t("key")
    # It captures the content inside the single or double quotes
    pattern = re.compile(r"t\(['\"]([^'\"]+)['\"]\)")
    
    for line in grep_output.splitlines():
        matches = pattern.findall(line)
        for key in matches:
            keys.add(key)
    return sorted(list(keys))

if __name__ == "__main__":
    grep_output = sys.stdin.read()
    extracted_keys = extract_translation_keys(grep_output)
    for key in extracted_keys:
        print(key)
