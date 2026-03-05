from dotenv import load_dotenv
load_dotenv()
import os
api_key = os.getenv("GEMINI_API_KEY")

from gemimg import GemImg

g = GemImg(api_key=api_key)

g = GemImg(model="gemini-2.5-flash-image")

prompt = """prompt here"""

gen = g.generate(prompt, aspect_ratio="1:1")

gen.image.save("temp/for-blog.png")


# Editing an image
# edit_prompt = """
# Make it black and white
# """

# gen_edit = g.generate(edit_prompt, g.image, aspect_ratio="16:9")



# Image on a grid e.g. sprite sheets

# from gemimg import GemImg, Grid

# g = GemImg(model="gemini-3-pro-image-preview")

# # Create a 2x2 grid configuration
# grid = Grid(rows=2, cols=2, image_size="2K")

# # The prompt should mention the grid dimensions and the number of distinct total images
# prompt = """
# Generate a 2x2 contiguous grid of 4 distinct award-winning images of a pair of cherry blossom trees in the following artistic styles, maintaining the same image composition of the trees across all 4 images:
# - Oil Painting
# - Watercolor
# - Digital Art
# - Pencil Sketch
# """

# gen = g.generate(prompt, grid=grid)