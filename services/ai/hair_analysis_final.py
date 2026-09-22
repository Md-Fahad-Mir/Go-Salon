"""
Final Hair & Face Analysis Tool
Uses OpenRouter (openai/gpt-4o by default) for fast, accurate analysis
Displays complete results in terminal with beautiful formatting
"""

import base64
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

import openrouter

# Load environment variables
load_dotenv()

# Configuration — shared with the API service, so the CLI and the endpoints
# always talk to the same provider and model.
MODEL = openrouter.ANALYSIS_MODEL  # Default: openai/gpt-4o — fast and reliable
OUTPUT_DIR = Path("./reports")

# System prompt
SYSTEM_PROMPT = """You are an expert AI consultant in facial aesthetics, dermatology,
trichology, hairstyling, and color theory. Analyze the photo deeply and honestly,
based only on visible features (no race/ethnicity assumptions).
Return ONE valid JSON object — no prose, no markdown, no code fences.
All scores are integers 0-100. If unobservable, use "unknown" / null / [] / false."""

SCHEMA = """
{
  "face_shape_analysis": {
    "detected_shape": "oval|round|square|rectangle|heart|diamond|triangle|oblong",
    "confidence_score": 0-100,
    "reasoning": "...",
    "facial_symmetry": {"score": 0-100, "notes": "..."},
    "jawline": "...", "cheekbones": "...", "chin_structure": "...",
    "forehead_proportions": "...", "facial_geometry_notes": "...",
    "golden_ratio_alignment": {"score": 0-100, "notes": "..."},
    "facial_architecture_summary": "..."
  },
  "skin_analysis": {
    "skin_tone": "...", "undertone": "warm|cool|neutral|olive",
    "texture": "...", "condition": "dry|oily|combination|normal",
    "acne_observation": "...", "dark_circles": "...", "redness": "...",
    "wrinkles": "...", "pores": "...",
    "smoothness_score": 0-100, "overall_skin_health_score": 0-100,
    "notes": "..."
  },
  "beard_analysis": {
    "has_beard": true_or_false,
    "style": "clean_shave|stubble|short_beard|full_beard|goatee|long_beard|other",
    "density": "...", "length": "...", "grooming_condition": "...", "notes": "..."
  },
  "hair_analysis": {
    "current_hairstyle": "...", "length_observed": "...",
    "texture_classification": "straight|wavy|curly|coily",
    "pattern": "...", "density": "low|medium|high",
    "thickness": "fine|medium|thick", "volume": "...",
    "hairline_condition": "...", "curl_pattern": "...",
    "growth_direction": "...", "shine_level": "low|medium|high",
    "frizz_level": "low|medium|high", "hair_health_score": 0-100,
    "damage_observation": "...", "thinning_observation": "...",
    "split_ends": "...", "dry_or_oily": "...", "scalp_visibility": "...",
    "notes": "..."
  },
  "hair_color_analysis": {
    "current_color": "...", "tone": "...", "warm_cool_balance": "...",
    "estimated_natural_color": "...", "color_depth": "..."
  },
  "style_trend_analysis": {
    "current_classification": "modern|trendy|classic|outdated",
    "trend_score": 0-100, "celebrity_inspired_category": "...", "notes": "..."
  },
  "recommendations": {
    "hairstyles": [
      {
        "name": "...", "description": "...", "why_it_suits": "...",
        "compatibility_score": 0-100,
        "styling_difficulty": "easy|moderate|hard",
        "maintenance_level": "low|medium|high",
        "styling_tips": ["...", "...", "..."],
        "suitability": "casual|professional|both"
      }
    ],
    "hair_colors": {
      "best_matching": ["..."], "natural_options": ["..."],
      "bold_options": ["..."], "colors_to_avoid": ["..."],
      "reasoning": "..."
    },
    "beard_recommendations": [
      {"style": "...", "why_it_suits": "...", "compatibility_score": 0-100}
    ],
    "hair_care": {
      "growth_suggestions": ["..."], "repair_suggestions": ["..."],
      "hair_fall_prevention": ["..."], "scalp_care": ["..."],
      "home_remedies": ["..."], "maintenance_routine": ["..."],
      "product_recommendations": {
        "oils": ["..."], "shampoo": ["..."], "conditioner": ["..."],
        "serum": ["..."], "hair_masks": ["..."]
      }
    },
    "face_care": {
      "skin_care_advice": ["..."], "acne_prevention": ["..."],
      "hydration": ["..."], "texture_improvement": ["..."],
      "grooming_advice": ["..."]
    }
  },
  "summary": "3-5 sentence overall summary."
}
""".strip()


def print_header(text, char="=", width=80):
    """Print a formatted header"""
    print("\n" + char * width)
    print(f"  {text}")
    print(char * width)


def print_section(title, char="-", width=80):
    """Print a section divider"""
    print("\n" + char * width)
    print(f"  {title}")
    print(char * width)


def print_score_bar(score, label="", width=40):
    """Print a visual score bar"""
    if score is None or score == 0:
        return
    
    filled = int((score / 100) * width)
    bar = "█" * filled + "░" * (width - filled)
    
    # Color based on score
    if score >= 80:
        color = "🟢"
    elif score >= 60:
        color = "🟡"
    else:
        color = "🔴"
    
    print(f"  {label:30s} {color} {bar} {score}/100")


def encode_image(path: Path) -> tuple[str, str]:
    """Encode image to base64"""
    ext = path.suffix.lower().lstrip(".")
    if ext == "jpg":
        ext = "jpeg"
    if ext not in {"jpeg", "png", "webp", "gif"}:
        raise ValueError(f"Unsupported image format: .{ext}")
    return base64.b64encode(path.read_bytes()).decode("utf-8"), f"image/{ext}"


def build_user_prompt(gender: str, hair_length: str) -> str:
    """Build user prompt"""
    return (
        f"User input — Gender: {gender}, Hair length: {hair_length}.\n"
        f"Treat HAIR analysis as highest priority and recommend AT LEAST 3 hairstyles "
        f"tailored to face shape, hair texture, density, skin tone & undertone, "
        f"using golden-ratio principles and color harmony.\n\n"
        f"Return ONLY this JSON schema:\n{SCHEMA}"
    )


def analyze_image(image_path: Path, gender: str, hair_length: str):
    """Analyze image with the configured OpenRouter model"""
    print_header("🤖 AI HAIR & FACE ANALYSIS", "=", 80)
    print(f"\n  📸 Image: {image_path.name}")
    print(f"  👤 Gender: {gender}")
    print(f"  ✂️  Hair Length: {hair_length}")
    print(f"  🧠 AI Model: {MODEL}")
    
    if not openrouter.has_api_key():
        print("\n❌ ERROR: OPENROUTER_API_KEY not set in .env file")
        sys.exit(1)
    
    if not image_path.exists():
        print(f"\n❌ ERROR: Image not found at {image_path}")
        sys.exit(1)
    
    print(f"\n  ⏳ Analyzing image with {MODEL}...")
    
    client = openrouter.make_client(openrouter.ANALYSIS_TIMEOUT)
    b64, media_type = encode_image(image_path)
    
    start_time = time.time()
    
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": build_user_prompt(gender, hair_length)},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{b64}",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
            temperature=0.3,
        )
        
        elapsed_time = time.time() - start_time
        
        content = response.choices[0].message.content or ""
        data = json.loads(content)
        
        print(f"  ✅ Analysis complete! ({elapsed_time:.2f} seconds)")
        print(f"  📊 Tokens used: {response.usage.total_tokens:,}")
        
        return data, elapsed_time, response.usage.total_tokens
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)


def display_results(data):
    """Display all results in terminal"""
    
    # ========================================================================
    # SUMMARY
    # ========================================================================
    print_header("📋 SUMMARY", "=", 80)
    summary = data.get("summary", "No summary available")
    print(f"\n{summary}\n")
    
    # ========================================================================
    # FACE SHAPE ANALYSIS
    # ========================================================================
    print_header("🎭 FACE SHAPE ANALYSIS", "=", 80)
    
    face = data.get("face_shape_analysis", {}) or {}
    
    print(f"\n  Detected Shape: {face.get('detected_shape', 'N/A').upper()}")
    print_score_bar(face.get('confidence_score', 0), "Confidence", 40)
    
    print(f"\n  💭 Reasoning:")
    print(f"     {face.get('reasoning', 'N/A')}")
    
    print(f"\n  📏 Facial Features:")
    print(f"     • Jawline: {face.get('jawline', 'N/A')}")
    print(f"     • Cheekbones: {face.get('cheekbones', 'N/A')}")
    print(f"     • Chin: {face.get('chin_structure', 'N/A')}")
    print(f"     • Forehead: {face.get('forehead_proportions', 'N/A')}")
    
    symmetry = face.get('facial_symmetry', {}) or {}
    golden = face.get('golden_ratio_alignment', {}) or {}
    
    print(f"\n  📊 Scores:")
    print_score_bar(symmetry.get('score', 0), "Facial Symmetry", 40)
    print_score_bar(golden.get('score', 0), "Golden Ratio", 40)
    
    # ========================================================================
    # SKIN ANALYSIS
    # ========================================================================
    print_header("🌟 SKIN ANALYSIS", "=", 80)
    
    skin = data.get("skin_analysis", {}) or {}
    
    print(f"\n  Skin Tone: {skin.get('skin_tone', 'N/A')}")
    print(f"  Undertone: {skin.get('undertone', 'N/A').upper()}")
    print(f"  Texture: {skin.get('texture', 'N/A')}")
    print(f"  Condition: {skin.get('condition', 'N/A')}")
    
    print(f"\n  🔍 Observations:")
    print(f"     • Acne: {skin.get('acne_observation', 'N/A')}")
    print(f"     • Dark Circles: {skin.get('dark_circles', 'N/A')}")
    print(f"     • Redness: {skin.get('redness', 'N/A')}")
    print(f"     • Wrinkles: {skin.get('wrinkles', 'N/A')}")
    print(f"     • Pores: {skin.get('pores', 'N/A')}")
    
    print(f"\n  📊 Health Scores:")
    print_score_bar(skin.get('smoothness_score', 0), "Smoothness", 40)
    print_score_bar(skin.get('overall_skin_health_score', 0), "Overall Health", 40)
    
    # ========================================================================
    # BEARD ANALYSIS
    # ========================================================================
    print_header("🧔 BEARD ANALYSIS", "=", 80)
    
    beard = data.get("beard_analysis", {}) or {}
    
    has_beard = beard.get('has_beard', False)
    print(f"\n  Has Beard: {'✅ YES' if has_beard else '❌ NO'}")
    
    if has_beard:
        print(f"  Style: {beard.get('style', 'N/A')}")
        print(f"  Density: {beard.get('density', 'N/A')}")
        print(f"  Length: {beard.get('length', 'N/A')}")
        print(f"  Grooming: {beard.get('grooming_condition', 'N/A')}")
    
    # ========================================================================
    # HAIR ANALYSIS
    # ========================================================================
    print_header("💇 HAIR ANALYSIS", "=", 80)
    
    hair = data.get("hair_analysis", {}) or {}
    
    print(f"\n  Current Style: {hair.get('current_hairstyle', 'N/A')}")
    print(f"  Length: {hair.get('length_observed', 'N/A')}")
    
    print(f"\n  📊 Hair Characteristics:")
    print(f"     • Texture: {hair.get('texture_classification', 'N/A').upper()}")
    print(f"     • Density: {hair.get('density', 'N/A').upper()}")
    print(f"     • Thickness: {hair.get('thickness', 'N/A').upper()}")
    print(f"     • Volume: {hair.get('volume', 'N/A')}")
    print(f"     • Shine: {hair.get('shine_level', 'N/A')}")
    print(f"     • Frizz: {hair.get('frizz_level', 'N/A')}")
    
    print(f"\n  🔍 Condition:")
    print(f"     • Hairline: {hair.get('hairline_condition', 'N/A')}")
    print(f"     • Damage: {hair.get('damage_observation', 'N/A')}")
    print(f"     • Thinning: {hair.get('thinning_observation', 'N/A')}")
    print(f"     • Dry/Oily: {hair.get('dry_or_oily', 'N/A')}")
    
    print(f"\n  📊 Health Score:")
    print_score_bar(hair.get('hair_health_score', 0), "Hair Health", 40)
    
    # ========================================================================
    # HAIR COLOR
    # ========================================================================
    print_header("🎨 HAIR COLOR ANALYSIS", "=", 80)
    
    color = data.get("hair_color_analysis", {}) or {}
    
    print(f"\n  Current Color: {color.get('current_color', 'N/A')}")
    print(f"  Tone: {color.get('tone', 'N/A')}")
    print(f"  Warm/Cool Balance: {color.get('warm_cool_balance', 'N/A')}")
    print(f"  Natural Color: {color.get('estimated_natural_color', 'N/A')}")
    print(f"  Depth: {color.get('color_depth', 'N/A')}")
    
    # ========================================================================
    # STYLE TREND
    # ========================================================================
    print_header("📈 STYLE TREND ANALYSIS", "=", 80)
    
    trend = data.get("style_trend_analysis", {}) or {}
    
    print(f"\n  Classification: {trend.get('current_classification', 'N/A').upper()}")
    print_score_bar(trend.get('trend_score', 0), "Trend Score", 40)
    print(f"\n  Category: {trend.get('celebrity_inspired_category', 'N/A')}")
    
    # ========================================================================
    # HAIRSTYLE RECOMMENDATIONS
    # ========================================================================
    print_header("💇‍♂️ HAIRSTYLE RECOMMENDATIONS", "=", 80)
    
    recs = data.get("recommendations", {}) or {}
    hairstyles = recs.get("hairstyles", []) or []
    
    for i, style in enumerate(hairstyles, 1):
        print(f"\n  {i}. {style.get('name', 'N/A').upper()}")
        print_score_bar(style.get('compatibility_score', 0), "Compatibility", 40)
        
        print(f"\n     📝 Description:")
        print(f"        {style.get('description', 'N/A')}")
        
        print(f"\n     ✨ Why It Suits You:")
        print(f"        {style.get('why_it_suits', 'N/A')}")
        
        print(f"\n     ℹ️  Details:")
        print(f"        • Difficulty: {style.get('styling_difficulty', 'N/A')}")
        print(f"        • Maintenance: {style.get('maintenance_level', 'N/A')}")
        print(f"        • Best For: {style.get('suitability', 'N/A')}")
        
        tips = style.get('styling_tips', [])
        if tips:
            print(f"\n     💡 Styling Tips:")
            for tip in tips:
                print(f"        • {tip}")
        
        if i < len(hairstyles):
            print("\n  " + "-" * 76)
    
    # ========================================================================
    # HAIR COLOR RECOMMENDATIONS
    # ========================================================================
    print_header("🎨 HAIR COLOR RECOMMENDATIONS", "=", 80)
    
    colors = recs.get("hair_colors", {}) or {}
    
    best = colors.get('best_matching', [])
    if best:
        print(f"\n  ✅ Best Matching Colors:")
        for color in best:
            print(f"     • {color}")
    
    natural = colors.get('natural_options', [])
    if natural:
        print(f"\n  🌿 Natural Options:")
        for color in natural:
            print(f"     • {color}")
    
    bold = colors.get('bold_options', [])
    if bold:
        print(f"\n  🔥 Bold Options:")
        for color in bold:
            print(f"     • {color}")
    
    avoid = colors.get('colors_to_avoid', [])
    if avoid:
        print(f"\n  ❌ Colors to Avoid:")
        for color in avoid:
            print(f"     • {color}")
    
    reasoning = colors.get('reasoning', '')
    if reasoning:
        print(f"\n  💭 Reasoning:")
        print(f"     {reasoning}")
    
    # ========================================================================
    # BEARD RECOMMENDATIONS
    # ========================================================================
    print_header("🧔 BEARD RECOMMENDATIONS", "=", 80)
    
    beard_recs = recs.get("beard_recommendations", []) or []
    
    for i, rec in enumerate(beard_recs, 1):
        print(f"\n  {i}. {rec.get('style', 'N/A').upper()}")
        print_score_bar(rec.get('compatibility_score', 0), "Compatibility", 40)
        print(f"\n     ✨ Why It Suits You:")
        print(f"        {rec.get('why_it_suits', 'N/A')}")
    
    # ========================================================================
    # HAIR CARE
    # ========================================================================
    print_header("🧴 HAIR CARE RECOMMENDATIONS", "=", 80)
    
    hair_care = recs.get("hair_care", {}) or {}
    
    sections = [
        ("💪 Growth Suggestions", "growth_suggestions"),
        ("🔧 Repair Suggestions", "repair_suggestions"),
        ("🛡️  Hair Fall Prevention", "hair_fall_prevention"),
        ("🧼 Scalp Care", "scalp_care"),
        ("🏠 Home Remedies", "home_remedies"),
        ("📅 Maintenance Routine", "maintenance_routine"),
    ]
    
    for title, key in sections:
        items = hair_care.get(key, [])
        if items:
            print(f"\n  {title}:")
            for item in items:
                print(f"     • {item}")
    
    # Product recommendations
    products = hair_care.get("product_recommendations", {}) or {}
    if products:
        print(f"\n  🛍️  Product Recommendations:")
        for category, items in products.items():
            if items:
                print(f"\n     {category.replace('_', ' ').title()}:")
                for item in items:
                    print(f"        • {item}")
    
    # ========================================================================
    # FACE CARE
    # ========================================================================
    print_header("🧴 FACE CARE RECOMMENDATIONS", "=", 80)
    
    face_care = recs.get("face_care", {}) or {}
    
    sections = [
        ("🧼 Skin Care Advice", "skin_care_advice"),
        ("🛡️  Acne Prevention", "acne_prevention"),
        ("💧 Hydration", "hydration"),
        ("✨ Texture Improvement", "texture_improvement"),
        ("💈 Grooming Advice", "grooming_advice"),
    ]
    
    for title, key in sections:
        items = face_care.get(key, [])
        if items:
            print(f"\n  {title}:")
            for item in items:
                print(f"     • {item}")


def save_report(data, image_path, gender, hair_length, elapsed_time, tokens):
    """Save report to file"""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{image_path.stem}_{timestamp}_gpt4o.json"
    filepath = OUTPUT_DIR / filename
    
    # Add metadata
    data["_metadata"] = {
        "model": MODEL,
        "image_path": str(image_path),
        "gender": gender,
        "hair_length": hair_length,
        "analysis_time": elapsed_time,
        "tokens_used": tokens,
        "timestamp": timestamp,
    }
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    return filepath


def main():
    """Main function"""
    # Get input
    if len(sys.argv) > 1:
        image_input = sys.argv[1]
    else:
        # Show available images
        current_dir = Path(".")
        image_extensions = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
        available_images = [f for f in current_dir.iterdir() 
                          if f.is_file() and f.suffix.lower() in image_extensions]
        
        if available_images:
            print("\n📸 Available images:")
            for img in sorted(available_images):
                print(f"   • {img.name}")
            print()
        
        image_input = input("Enter image filename (e.g., 1.png): ").strip()
    
    image_path = Path(image_input).expanduser().resolve()
    
    # Get gender
    if len(sys.argv) > 2:
        gender = sys.argv[2].lower()
    else:
        while True:
            gender = input("Enter gender (male/female): ").strip().lower()
            if gender in {"male", "female"}:
                break
            print("❌ Please enter 'male' or 'female'")
    
    # Get hair length
    if len(sys.argv) > 3:
        hair_length = sys.argv[3].lower()
    else:
        while True:
            hair_length = input("Enter hair length (short/medium/long): ").strip().lower()
            if hair_length in {"short", "medium", "long"}:
                break
            print("❌ Please enter 'short', 'medium', or 'long'")
    
    # Analyze
    data, elapsed_time, tokens = analyze_image(image_path, gender, hair_length)
    
    # Display results
    display_results(data)
    
    # Save report
    filepath = save_report(data, image_path, gender, hair_length, elapsed_time, tokens)
    
    # Footer
    print_header("✅ ANALYSIS COMPLETE", "=", 80)
    print(f"\n  ⏱️  Analysis Time: {elapsed_time:.2f} seconds")
    print(f"  🎫 Tokens Used: {tokens:,}")
    print(f"  💰 Estimated Cost: ~${(tokens * 0.0000125):.4f}")
    print(f"  💾 Report Saved: {filepath}")
    print("\n" + "=" * 80)
    print()


if __name__ == "__main__":
    main()
