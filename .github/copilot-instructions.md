# Copilot Instructions for Infinite Hips Project

**This file contains essential project context that keeps the Infinite Hips project working correctly.**
- Only make changes when the user explicitly asks
- Never remove information unless specifically instructed
- Always preserve existing content unless user wants it changed
- When unsure about editing this file, ask the user first
- Remember: Small changes here can break the entire project understanding

### Terminal Commands
- **Batch operations preferred** - Use `&&` to chain commands
- **Reduce confirmations** - Combine multiple operations into single commands
- **Always use absolute paths**
- **Clean up metadata files** - Remove `._*` files after operations
- **Multiple file operations** - Use wildcards and loops when possible
- **Delete operations** - Batch all deletions: `Remove-Item "file1" -Force && Remove-Item "file2" -Force`
- **Git operations** - Chain git commands: `git add . && git commit -m "message" && git push`
- **System file cleanup** - Always remove .DS_Store, Thumbs.db, and other system files in batches


### Document Generation Requirements
- **ALL generated documents MUST be placed in the `/docs` folder**
- **Markdown files**: Always create in `/docs/filename.md`
- **NO documents should be created outside the `/docs` directory**

### When Reorganizing Files
1. Plan all operations as batch commands
2. Update HTML source image links
3. Verify content mappings remain intact
4. Clean up temporary/metadata files
5. Test responsive design and links

### When Updating Content
1. Edit markdown source in `/docs` directory
5. Test mobile responsiveness
7. Keep `.vscode/copilot-instructions.md` up to date.

## Deployment
- **Repository**: GitHub (jeff-hamm organization)
- **Hosting**: GitHub Pages
- **Process**: Standard git workflow auto-deploys

## Technical Constraints
- Modern browsers only (ES6+ JavaScript)
- Local storage only (no cloud sync)
- Static site limitations
- Use CSS variables to reduce duplication and to allow custom themes


## Testing Checklist
- [ ] All pages load correctly
- [ ] Mobile responsive design works
- [ ] Interactive features save/load properly
- [ ] Cross-references between pages work
- [ ] Print layouts are clean

## Quick Reference Commands

### Git Operations (Be Very Helpful - User is Not Git Expert)

#### Basic Workflow
```bash
git add . && git commit -m "Description" && git push origin main
```

#### Common Git Tasks for Non-Git Users
```bash
# Check what files have changed
git status

# See what changes you made
git diff

# Save your work with a message
git add .
git commit -m "Brief description of what you changed"

# Upload your changes to GitHub
git push origin main

# Get the latest changes from GitHub
git pull origin main

# If you made a mistake, see recent commits
git log --oneline -10

# If you need to undo the last commit (but keep your changes)
git reset --soft HEAD~1
```

#### When Things Go Wrong
```bash
# If git push fails, try this first
git pull origin main

# If you have conflicts, you'll need to resolve them manually
# Look for files with <<<<<<< markers and edit them

# After fixing conflicts
git add .
git commit -m "Fixed merge conflicts"
git push origin main
```

### Local Development
```bash
python -m http.server 8000 --directory src  # Then open http://localhost:8000
```

## Red Flags to Avoid
- ❌ CSS duplication
- ❌ Altering medical information accuracy
- ❌ Breaking mobile responsiveness
- ❌ Individual terminal commands when batching is possible
- ❌ Generic file names (scan1, scan2, etc.)

## Success Patterns
- ✅ Descriptive, content-based file names
- ✅ Batched terminal operations with `&&`
- ✅ Mobile-first responsive design
- ✅ Clean, accessible medical documentation
- ✅ Use CSS variables to reduce duplication and to allow custom themes

This project successfully transformed from basic document organization into a comprehensive digital health companion. Always prioritize medical accuracy, user experience during recovery, and the established design patterns.
