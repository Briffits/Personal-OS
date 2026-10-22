#!/usr/bin/env python3
"""Dependency-free source/project audit. This does NOT compile Swift or run iOS."""
import json
from pathlib import Path
import plistlib
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT / "HealthAuthorizationComparison.xcodeproj"


def parse_openstep(text):
    """Parse this project's OpenStep plist, rejecting gaps and duplicate keys."""
    pattern = re.compile(r'\s+|//[^\n]*|/\*.*?\*/|"(?:\\.|[^"\\])*"|[{}()=;,]|[\w.$/<>+\-]+', re.S)
    tokens = []
    end = 0
    for match in pattern.finditer(text):
        assert match.start() == end, f"Unparsed project syntax at {end}"
        end = match.end()
        token = match.group()
        if not token.isspace() and not token.startswith(("//", "/*")):
            tokens.append(token)
    assert end == len(text)
    index = 0

    def take(expected=None):
        nonlocal index
        token = tokens[index]
        index += 1
        assert expected is None or token == expected, (expected, token)
        return token

    def value():
        token = take()
        if token == "{":
            result = {}
            while tokens[index] != "}":
                key = value()
                assert isinstance(key, str) and key not in result
                take("=")
                result[key] = value()
                take(";")
            take("}")
            return result
        if token == "(":
            result = []
            while tokens[index] != ")":
                result.append(value())
                if tokens[index] != ")":
                    take(",")
            take(")")
            return result
        assert token not in "}=;,)"
        return json.loads(token) if token.startswith('"') else token

    result = value()
    assert index == len(tokens)
    return result


def check():
    project_text = (PROJECT / "project.pbxproj").read_text()
    project = parse_openstep(project_text)
    objects = project["objects"]
    refs = set(re.findall(r"\b[A-F0-9]{24}\b", project_text))
    assert refs == set(objects), "Dangling or malformed project reference"
    root = objects[project["rootObject"]]
    assert root["isa"] == "PBXProject" and len(root["targets"]) == 1
    target_id = root["targets"][0]
    target = objects[target_id]
    assert target["isa"] == "PBXNativeTarget"
    assert target["productType"] == "com.apple.product-type.application"
    assert target["dependencies"] == [] and target["buildRules"] == []
    assert not any("Package" in o["isa"] or o["isa"] == "PBXShellScriptBuildPhase" for o in objects.values())
    native_targets = [o for o in objects.values() if o["isa"] == "PBXNativeTarget"]
    assert len(native_targets) == 1

    phases = {objects[p]["isa"]: objects[p] for p in target["buildPhases"]}
    assert set(phases) == {"PBXSourcesBuildPhase", "PBXFrameworksBuildPhase", "PBXResourcesBuildPhase"}
    assert phases["PBXFrameworksBuildPhase"]["files"] == []
    assert phases["PBXResourcesBuildPhase"]["files"] == []
    source_paths = [objects[objects[f]["fileRef"]]["path"] for f in phases["PBXSourcesBuildPhase"]["files"]]
    assert set(source_paths) == {p.name for p in ROOT.glob("*.swift")}
    assert len(source_paths) == 3
    for obj in objects.values():
        if obj["isa"] == "PBXFileReference" and obj["sourceTree"] != "BUILT_PRODUCTS_DIR":
            path = (ROOT / obj["path"]).resolve()
            assert path.parent == ROOT and path.is_file(), path

    def configs(owner):
        return {objects[c]["name"]: objects[c]["buildSettings"]
                for c in objects[owner["buildConfigurationList"]]["buildConfigurations"]}

    project_configs, target_configs = configs(root), configs(target)
    assert set(project_configs) == set(target_configs) == {"Debug", "Release"}
    for name, settings in target_configs.items():
        assert settings["PRODUCT_BUNDLE_IDENTIFIER"] == "org.personalos.diagnostics.HealthAuthorizationComparison"
        assert settings["DEVELOPMENT_TEAM"] == "", "Do not commit private signing setup"
        assert settings["TARGETED_DEVICE_FAMILY"] == "1"
        assert settings["CODE_SIGN_ENTITLEMENTS"] == "HealthAuthorizationComparison.entitlements"
        assert settings["INFOPLIST_FILE"] == "Info.plist"
        assert project_configs[name]["IPHONEOS_DEPLOYMENT_TARGET"] == "26.0"
        assert project_configs[name]["SWIFT_VERSION"] == "5.0"
    assert "DEBUG" in project_configs["Debug"]["SWIFT_ACTIVE_COMPILATION_CONDITIONS"]
    assert "DEBUG" not in project_configs["Release"].get("SWIFT_ACTIVE_COMPILATION_CONDITIONS", "")

    with (ROOT / "Info.plist").open("rb") as file:
        info = plistlib.load(file)
    with (ROOT / "HealthAuthorizationComparison.entitlements").open("rb") as file:
        entitlements = plistlib.load(file)
    assert entitlements == {"com.apple.developer.healthkit": True}
    assert info["CFBundleIdentifier"] == "$(PRODUCT_BUNDLE_IDENTIFIER)"
    assert {k for k in info if k.endswith("UsageDescription")} == {"NSHealthShareUsageDescription"}
    assert info["UIApplicationSceneManifest"]["UIApplicationSupportsMultipleScenes"] is False

    scheme = ET.parse(PROJECT / "xcshareddata/xcschemes/HealthAuthorizationComparison.xcscheme").getroot()
    for ref in scheme.iter("BuildableReference"):
        assert ref.attrib["BlueprintIdentifier"] == target_id
        assert ref.attrib["ReferencedContainer"] == "container:HealthAuthorizationComparison.xcodeproj"
    launch = scheme.find("LaunchAction")
    assert launch.attrib["buildConfiguration"] == "Debug"
    env = launch.findall("EnvironmentVariables/EnvironmentVariable")
    assert len(env) == 1 and env[0].attrib == {
        "key": "PERSONALOS_NATIVE_HEALTH_PATH", "value": "S", "isEnabled": "NO"}
    assert not scheme.findall(".//TestableReference")

    sources = "\n".join((ROOT / name).read_text() for name in source_paths)
    imports = set(re.findall(r"^import (\w+)$", sources, re.M))
    assert imports <= {"SwiftUI", "UIKit", "Combine", "HealthKit", "HealthKitUI"}
    prohibited = r"\b(?:\w*Query\w*|UserDefaults|FileManager|URLSession|SecItem\w*|AppStorage|SceneStorage|SwiftData|CoreData)\b|\.(?:save|execute|requestAuthorization|authorizationStatus|getRequestStatusForAuthorization)\s*\("
    code = re.sub(r"//[^\n]*", "", sources)
    assert not re.search(prohibited, code), "Unexpected query, persistence, networking or alternate authorization API"
    assert code.count(".healthDataAccessRequest(") == 2
    assert "case .success(true): self = .successTrue" in code
    assert "case .success(false): self = .successFalse" in code
    assert "started = false" in code and code.count("started = false") == 1
    assert "readiness?.cancelled = true" in code and "!readiness.cancelled" in code
    assert "callback.additionalOrLate.ignored" in code and "cleanup.timeout.hostNotReleased" in code
    assert "Sheet visibility: not verified" in sources and "Manual cancellation: not verified" in sources
    print("PASS: project graph, source membership, one app identity, plist/scheme configuration, disabled opt-in, source boundary audit.")
    print("NOT CHECKED: Swift compilation/typechecking, Apple SDK signatures, signing, runtime timing, sheet visibility or device cleanup.")


if __name__ == "__main__":
    check()
