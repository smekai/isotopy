# An example agent pack

A pack is a folder of `agents/` and `steps/` that any Isotopy project can install
from Setup → Agents, either from a local folder or from a git repository with a path
inside it. This one is the format example, and the source the shared-agents work was
verified against over git:

```
source: https://github.com/smekai/isotopy.git
path:   docs/dogfood/agent-pack
```

| File | What it is |
| --- | --- |
| `agents/seo-writer/agent.md` | The agent: `name`, `title`, `glyph`, `description`, then who it is |
| `agents/seo-writer/knowledge/*.md` | Its reference library, listed in its prompt by path, never pasted in |
| `agents/seo-writer/duties/*.md` | Recurring work, seeded once as a switched-off schedule |
| `steps/draft-post.md` | An assignment any agent on a team can be given |

Only `agents/` and `steps/` are copied; this README is not. A project's own
`.isotopy/` holds the same two folders, so any project is already a pack.
