#!/bin/bash
#
# Initialize a new project from the React/Express product development template
#
# Usage: ./init-project.sh <project-name> [project-type]
#
# Project types: web, mobile, backend, cli
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print with color
print_info() {
    echo -e "${BLUE}i${NC} $1"
}

print_success() {
    echo -e "${GREEN}+${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_error() {
    echo -e "${RED}x${NC} $1"
}

# Header
echo ""
echo -e "${GREEN}+-----------------------------------------------------------+${NC}"
echo -e "${GREEN}|   React/Express Product Dev Template - Project Initializer |${NC}"
echo -e "${GREEN}+-----------------------------------------------------------+${NC}"
echo ""

# Check for required arguments
if [ -z "$1" ]; then
    print_error "Project name is required"
    echo ""
    echo "Usage: ./init-project.sh <project-name> [project-type]"
    echo ""
    echo "Project types:"
    echo "  web      - React web application"
    echo "  mobile   - React Native mobile application"
    echo "  backend  - Express.js backend/API service"
    echo "  cli      - Node.js command-line tool"
    echo ""
    echo "Examples:"
    echo "  ./init-project.sh my-app"
    echo "  ./init-project.sh my-api backend"
    echo "  ./init-project.sh my-mobile-app mobile"
    exit 1
fi

PROJECT_NAME=$1
PROJECT_TYPE=${2:-"web"}

# Validate project name
if [[ ! "$PROJECT_NAME" =~ ^[a-zA-Z][a-zA-Z0-9_-]*$ ]]; then
    print_error "Invalid project name: $PROJECT_NAME"
    echo "Project name must start with a letter and contain only letters, numbers, hyphens, and underscores."
    exit 1
fi

# Validate project type
case $PROJECT_TYPE in
    web|mobile|backend|cli)
        ;;
    *)
        print_error "Invalid project type: $PROJECT_TYPE"
        echo "Valid options: web, mobile, backend, cli"
        exit 1
        ;;
esac

print_info "Initializing project: ${GREEN}$PROJECT_NAME${NC}"
print_info "Project type: ${GREEN}$PROJECT_TYPE${NC}"
echo ""

# Get the script's directory (template root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Update CLAUDE.md with project info
print_info "Configuring CLAUDE.md..."

if [ -f "CLAUDE.md" ]; then
    # macOS compatible sed
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\[Your Project Name\]/$PROJECT_NAME/g" CLAUDE.md
        sed -i '' "s/\[web | mobile | backend | cli\]/$PROJECT_TYPE/g" CLAUDE.md
    else
        sed -i "s/\[Your Project Name\]/$PROJECT_NAME/g" CLAUDE.md
        sed -i "s/\[web | mobile | backend | cli\]/$PROJECT_TYPE/g" CLAUDE.md
    fi
    print_success "CLAUDE.md updated with project info"
else
    print_warning "CLAUDE.md not found, skipping update"
fi

# Append project-type specific configuration
print_info "Applying $PROJECT_TYPE configuration..."

if [ -f "config/$PROJECT_TYPE/CLAUDE.local.md" ]; then
    echo "" >> CLAUDE.md
    echo "---" >> CLAUDE.md
    echo "" >> CLAUDE.md
    echo "## Platform-Specific Configuration" >> CLAUDE.md
    echo "" >> CLAUDE.md
    cat "config/$PROJECT_TYPE/CLAUDE.local.md" >> CLAUDE.md
    print_success "Platform-specific configuration added"
else
    print_warning "Platform config not found at config/$PROJECT_TYPE/CLAUDE.local.md"
fi

# Create .claude/settings.local.json from example if not exists
print_info "Setting up local configuration..."

if [ -f ".claude/settings.local.json.example" ] && [ ! -f ".claude/settings.local.json" ]; then
    cp .claude/settings.local.json.example .claude/settings.local.json
    print_success "Created .claude/settings.local.json from example"
else
    print_info "Local settings already exist or example not found"
fi

# Create .env from example if not exists
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
    cp .env.example .env
    print_success "Created .env from .env.example"
    print_warning "Remember to configure your .env file with actual values"
else
    print_info ".env already exists or .env.example not found"
fi

# Initialize git if not already
if [ ! -d ".git" ]; then
    print_info "Initializing git repository..."
    git init > /dev/null 2>&1
    print_success "Git repository initialized"
else
    print_info "Git repository already exists"
fi

# Make an initial commit if repo is fresh
if [ -d ".git" ]; then
    COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo "0")
    if [ "$COMMIT_COUNT" = "0" ]; then
        print_info "Creating initial commit..."
        git add -A
        git commit -m "Initial commit from product-dev-template-react

Project: $PROJECT_NAME
Type: $PROJECT_TYPE
Stack: React, Express.js, PostgreSQL, TypeScript

Generated with product-dev-template-react" > /dev/null 2>&1
        print_success "Initial commit created"
    fi
fi

# Store template origin for future updates
TEMPLATE_ORIGIN=${TEMPLATE_ORIGIN:-}

print_info "Setting up template sync..."
if [ -z "$TEMPLATE_ORIGIN" ]; then
    print_info "TEMPLATE_ORIGIN not set; skipping template remote"
elif [ -d ".git" ]; then
    # Add template as upstream remote for future updates
    git remote add template "$TEMPLATE_ORIGIN" 2>/dev/null || true
    print_success "Template remote added (for pulling future updates)"
fi

# Create project-specific feedback log
print_info "Creating feedback tracking..."
if [ -f "docs/templates/template-feedback.md" ]; then
    cp docs/templates/template-feedback.md docs/template-feedback.md
    # Update with project info
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/\[Your project name\]/$PROJECT_NAME/g" docs/template-feedback.md
        sed -i '' "s/\[web \/ mobile \/ backend \/ cli\]/$PROJECT_TYPE/g" docs/template-feedback.md
        sed -i '' "s/\[YYYY-MM-DD\]/$(date +%Y-%m-%d)/g" docs/template-feedback.md
    else
        sed -i "s/\[Your project name\]/$PROJECT_NAME/g" docs/template-feedback.md
        sed -i "s/\[web \/ mobile \/ backend \/ cli\]/$PROJECT_TYPE/g" docs/template-feedback.md
        sed -i "s/\[YYYY-MM-DD\]/$(date +%Y-%m-%d)/g" docs/template-feedback.md
    fi
    print_success "Created docs/template-feedback.md for tracking improvements"
fi

# Summary
echo ""
echo -e "${GREEN}+-----------------------------------------------------------+${NC}"
echo -e "${GREEN}|                 Initialization Complete                    |${NC}"
echo -e "${GREEN}+-----------------------------------------------------------+${NC}"
echo ""

echo -e "${BLUE}Project:${NC} $PROJECT_NAME"
echo -e "${BLUE}Type:${NC} $PROJECT_TYPE"
echo -e "${BLUE}Stack:${NC} React, Express.js, PostgreSQL, TypeScript"
echo ""

echo -e "${YELLOW}Next Steps:${NC}"
echo ""
echo "  1. Review and customize CLAUDE.md for your project"
echo "  2. Configure .claude/settings.json for your team"
echo "  3. Update .env with your environment variables"
echo "  4. Install dependencies: npm install"
echo "  5. Set up database: npx prisma migrate dev"
echo "  6. Start development with: /start-discovery"
echo ""

echo -e "${BLUE}Available Commands:${NC}"
echo ""
echo "  /start-discovery      Begin requirements gathering"
echo "  /start-planning       Start architecture and planning"
echo "  /start-implementation Begin development"
echo "  /run-review           Execute code review workflow"
echo "  /prepare-release      Prepare for deployment"
echo ""

echo -e "${BLUE}Documentation:${NC}"
echo ""
echo "  docs/phases/          Development phase guides"
echo "  docs/templates/       Document templates"
echo "  docs/checklists/      Project checklists"
echo "  .claude/skills/       AI-powered skills"
echo "  .claude/rules/        Development rules"
echo ""

echo -e "${BLUE}Template Improvement:${NC}"
echo ""
echo "  docs/template-feedback.md   Track what works and what doesn't"
echo "  CONTRIBUTING.md             How to contribute improvements back"
echo ""
echo "  To pull template updates:   git fetch template && git diff HEAD template/main"
echo ""

echo -e "${GREEN}Happy coding!${NC}"
echo ""
