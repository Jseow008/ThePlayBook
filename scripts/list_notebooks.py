# /// script
# dependencies = [
#   "mcp",
# ]
# ///

import asyncio
import os
import sys
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Get the path to the notebooklm-mcp executable
# Assuming it's in the PATH since it was installed via uv tool
SERVER_COMMAND = "notebooklm-mcp" 
SERVER_ARGS = []

async def main():
    print(f"Connecting to {SERVER_COMMAND}...")
    
    server_params = StdioServerParameters(
        command=SERVER_COMMAND,
        args=SERVER_ARGS,
        env=os.environ.copy()
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            
            # List Resources specifically to see notebooks
            print("\n--- Resources (Notebooks) ---")
            try:
                resources = await session.list_resources()
                for resource in resources.resources:
                    print(f"- {resource.name} ({resource.uri})")
            except Exception as e:
                print(f"Error listing resources: {e}")

            # List Tools to see what we can do
            print("\n--- Available Tools ---")
            try:
                tools = await session.list_tools()
                for tool in tools.tools:
                    print(f"- {tool.name}: {tool.description}")
            except Exception as e:
                print(f"Error listing tools: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except FileNotFoundError:
        print(f"Error: Command '{SERVER_COMMAND}' not found. Make sure it's installed and in your PATH.")
    except Exception as e:
        print(f"An error occurred: {e}")
