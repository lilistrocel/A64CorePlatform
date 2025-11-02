#!/usr/bin/env python3
"""
Script to split farm-management-module.md into smaller, manageable files
"""

def split_farm_documentation():
    """Split the large farm management documentation into smaller files"""

    source_file = r"C:\Code\A64CorePlatform\Docs\2-Working-Progress\farm-management-module.md"
    output_dir = r"C:\Code\A64CorePlatform\Docs\2-Working-Progress\farm-management"

    # Read the entire file
    with open(source_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Define split points based on major sections
    splits = [
        {
            "file": "01-overview-architecture.md",
            "start_marker": "## Executive Summary",
            "end_marker": "## Data Models",
            "title": "# Farm Management Module - Overview & Architecture\n\n"
        },
        {
            "file": "02-data-models.md",
            "start_marker": "## Data Models",
            "end_marker": "## User Roles & Permissions",
            "title": "# Farm Management Module - Data Models\n\n"
        },
        {
            "file": "03-permissions.md",
            "start_marker": "## User Roles & Permissions",
            "end_marker": "## State Machine & Workflows",
            "title": "# Farm Management Module - User Roles & Permissions\n\n"
        },
        {
            "file": "04-workflows.md",
            "start_marker": "## State Machine & Workflows",
            "end_marker": "## API Endpoints",
            "title": "# Farm Management Module - State Machine & Workflows\n\n"
        },
        {
            "file": "05-api-endpoints.md",
            "start_marker": "## API Endpoints",
            "end_marker": "## Database Schema",
            "title": "# Farm Management Module - API Endpoints\n\n"
        },
        {
            "file": "06-database-schema.md",
            "start_marker": "## Database Schema",
            "end_marker": "## User Interface Components",
            "title": "# Farm Management Module - Database Schema\n\n"
        },
        {
            "file": "07-ui-components.md",
            "start_marker": "## User Interface Components",
            "end_marker": "## Implementation Phases",
            "title": "# Farm Management Module - User Interface Components\n\n"
        },
        {
            "file": "08-implementation.md",
            "start_marker": "## Implementation Phases",
            "end_marker": None,  # Goes to end of file
            "title": "# Farm Management Module - Implementation Plan\n\n"
        }
    ]

    import os
    os.makedirs(output_dir, exist_ok=True)

    for split in splits:
        output_file = os.path.join(output_dir, split["file"])

        # Find start and end indices
        start_idx = None
        end_idx = len(lines)

        for i, line in enumerate(lines):
            if split["start_marker"] in line:
                start_idx = i
            if split["end_marker"] and split["end_marker"] in line and start_idx is not None:
                end_idx = i
                break

        if start_idx is None:
            print(f"Warning: Could not find start marker '{split['start_marker']}' for {split['file']}")
            continue

        # Extract content
        content = split["title"] + ''.join(lines[start_idx:end_idx])

        # Add navigation footer
        footer = "\n\n---\n\n**[← Back to Index](./README.md)**\n"
        content += footer

        # Write file
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(content)

        print(f"[OK] Created {split['file']} ({end_idx - start_idx} lines)")

    print("\n[SUCCESS] Documentation split complete!")
    print(f"Files saved to: {output_dir}")

if __name__ == "__main__":
    split_farm_documentation()
