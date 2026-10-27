"""Small, reviewable English skill catalogue. Aliases imply a mention, not ability."""
import re
import unicodedata

# Extend this catalogue as real evaluation cases expose gaps.
SKILLS = {
    "Python": ("python",), "SQL": ("sql", "structured query language"),
    "JavaScript": ("javascript", "java script", "js"),
    "TypeScript": ("typescript",), "Java": ("java",),
    "C++": ("c++", "cpp"), "C#": ("c#", "c sharp"),
    ".NET": (".net", "dotnet"), "Go": ("golang", "go programming"),
    "R": ("r programming", "r language", "rstudio"),
    "Ruby": ("ruby",), "PHP": ("php",), "Rust": ("rust",),
    "React": ("react", "reactjs", "react.js"),
    "Next.js": ("next.js", "nextjs"), "Node.js": ("node.js", "nodejs"),
    "FastAPI": ("fastapi",), "Django": ("django",), "Flask": ("flask",),
    "HTML": ("html", "html5"), "CSS": ("css", "css3"),
    "Git": ("git", "version control with git"), "Docker": ("docker",),
    "Kubernetes": ("kubernetes", "k8s"), "Linux": ("linux",),
    "AWS": ("aws", "amazon web services"),
    "Azure": ("azure", "microsoft azure"),
    "Google Cloud": ("google cloud", "gcp"),
    "PostgreSQL": ("postgresql", "postgres"), "MySQL": ("mysql",),
    "MongoDB": ("mongodb", "mongo db"), "Redis": ("redis",),
    "Excel": ("excel", "microsoft excel", "ms excel"),
    "Power BI": ("power bi", "powerbi"), "Tableau": ("tableau",),
    "Pandas": ("pandas",), "NumPy": ("numpy",),
    "TensorFlow": ("tensorflow",), "PyTorch": ("pytorch",),
    "scikit-learn": ("scikit-learn", "sklearn"),
    "REST APIs": ("rest api", "rest apis", "restful api", "restful apis"),
    "CI/CD": ("ci/cd", "continuous integration", "continuous delivery"),
    "Automated testing": ("automated testing", "unit testing", "pytest", "jest"),
    "Data analysis": ("data analysis", "data analytics", "analyse data", "analyze data"),
    "Data visualisation": ("data visualisation", "data visualization"),
    "Machine learning": ("machine learning",),
    "Project management": ("project management", "project planning"),
    "Agile": ("agile",), "Scrum": ("scrum",),
    "Stakeholder management": ("stakeholder management", "stakeholder engagement"),
    "Communication": ("communication", "communicating", "presentation skills"),
    "Leadership": ("leadership", "team leadership", "leading teams"),
    "Teamwork": ("teamwork", "team work", "team collaboration"),
    "Problem solving": ("problem solving", "problem-solving"),
    "Customer service": ("customer service", "customer support"),
    "Sales": ("sales",), "Digital marketing": ("digital marketing",),
    "Financial analysis": ("financial analysis",),
    "Risk management": ("risk management",),
    "Cybersecurity": ("cybersecurity", "cyber security", "information security"),
    "PMP": ("pmp", "project management professional"),
    "CISSP": ("cissp",),
}


def normalise(text: str) -> str:
    return unicodedata.normalize("NFKC", text).replace("’", "'").casefold()


def alias_pattern(alias: str) -> re.Pattern:
    # Boundaries preserve C++, C#, .NET and prevent Java/JavaScript or SQL/MySQL matches.
    escaped = re.escape(normalise(alias)).replace(r"\ ", r"[\s-]+")
    return re.compile(r"(?<![\w+#.])" + escaped + r"(?![\w+#])")


PATTERNS = {name: [alias_pattern(alias) for alias in aliases] for name, aliases in SKILLS.items()}


def mentions(text: str) -> list[tuple[str, int, int]]:
    value = normalise(text)
    found = []
    for name, patterns in PATTERNS.items():
        match = next((match for pattern in patterns if (match := pattern.search(value))), None)
        if name == "Excel" and match and re.match(r"\s+(?:at|in)\b", value[match.end():]):
            continue  # "excel at communication" is a verb, not spreadsheet experience.
        if match:
            found.append((name, match.start(), match.end()))
    return sorted(found, key=lambda item: item[1])


def uncertain_or_negated(text: str, start: int, end: int) -> bool:
    value = normalise(text)
    before = value[max(0, start - 90):start]
    after = value[end:end + 65]
    return bool(
        re.search(r"\b(?:no|without|lacking|not)\s+(?:any\s+)?$", before)
        or re.search(r"\b(?:no|without|lack(?:ing)?|not)\b.{0,50}\b(?:experience|knowledge|proficien\w*|skills?|exposure)\b.{0,25}$", before)
        or re.search(r"\b(?:learning|studying|interested in|want to learn|plan to learn|aspiring)\b.{0,25}$", before)
        or re.search(r"^\s*[:,-]?\s*(?:not required|not necessary|not essential|is not required|experience is not required|no experience)", after)
        or re.search(r"^\s+(?:(?:is|was|are)\s+)?not\b", after)
    )


def text_units(text: str) -> list[str]:
    # Avoid splitting inside .NET, Node.js, C++ or decimal year values.
    lines = re.split(r"[\r\n]+|(?<=[.!?;])\s+(?=[A-Z•*-])|\s+\b(?:but|however)\b\s+", text)
    return [line.strip(" \t•*-–—") for line in lines if line.strip(" \t•*-–—")]
