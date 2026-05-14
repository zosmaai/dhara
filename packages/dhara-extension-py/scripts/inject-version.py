"""Inject version from git tag into pyproject.toml."""
import re, os

tag = os.environ.get("TAG", "")
if re.match(r"^v\d+\.\d+\.\d+$", tag):
    version = tag.lstrip("v")
    with open("pyproject.toml") as f:
        content = f.read()
    content = re.sub(
        r'^version = ".*"',
        f'version = "{version}"',
        content,
        count=1,
        flags=re.MULTILINE,
    )
    with open("pyproject.toml", "w") as f:
        f.write(content)
    print(f"Version set to: {version}")
else:
    print(f"No valid semver tag (got: {tag}) -- using existing version")
