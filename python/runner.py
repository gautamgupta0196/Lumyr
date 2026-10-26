"""
Lumyr Dashboard Runner
This script is the wrapper that runs generated Streamlit dashboards.
"""

import streamlit as st
import sys
import os

# Set page config
st.set_page_config(
    page_title="Lumyr Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Lumyr default stylesheet — aligns generated dashboards with the app's design system
st.markdown("""
<style>
    /* ── Load Inter font ────────────────────────────── */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    /* ── Typography ─────────────────────────────────── */
    html, body, .stApp, .stApp * {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
    }

    /* ── Global background ──────────────────────────── */
    .stApp {
        max-width: 100%;
        background: #f8f9fb !important;
    }

    /* ── Hide ALL Streamlit chrome ──────────────────── */
    #MainMenu, footer, header, .stDeployButton,
    [data-testid="stToolbar"],
    [data-testid="stHeader"],
    [data-testid="stStatusWidget"],
    [data-testid="stDecoration"],
    button[kind="header"],
    .viewerBadge_link__qRIco,
    ._profileContainer_gzau3_53,
    ._profilePreview_gzau3_63 {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
        position: absolute !important;
        top: -9999px !important;
    }

    /* ── Layout & spacing ───────────────────────────── */
    .block-container {
        padding: 1.5rem 2.5rem 2rem 2.5rem !important;
        max-width: 100% !important;
    }

    /* Remove Streamlit's default top padding that creates empty space */
    .stApp > header + div {
        padding-top: 0 !important;
    }
    .appview-container { padding-top: 0 !important; }

    /* Column gap spacing */
    [data-testid="stHorizontalBlock"] {
        gap: 1rem !important;
        align-items: stretch !important;
    }
    [data-testid="column"] {
        padding: 0 !important;
    }

    /* Vertical spacing between elements */
    [data-testid="stVerticalBlock"] > div {
        margin-bottom: 0.25rem;
    }

    /* ── Headings ───────────────────────────────────── */
    h1 {
        font-size: 1.5rem !important;
        font-weight: 700 !important;
        color: #111827 !important;
        letter-spacing: -0.025em !important;
        margin-bottom: 0.25rem !important;
        line-height: 1.3 !important;
    }
    h2 {
        font-size: 1.15rem !important;
        font-weight: 600 !important;
        color: #111827 !important;
        letter-spacing: -0.015em !important;
        margin-top: 1.5rem !important;
        margin-bottom: 0.5rem !important;
        line-height: 1.35 !important;
    }
    h3 {
        font-size: 0.95rem !important;
        font-weight: 600 !important;
        color: #374151 !important;
        letter-spacing: -0.01em !important;
        margin-bottom: 0.5rem !important;
        line-height: 1.4 !important;
    }

    /* Subtitles / captions */
    .stCaption, [data-testid="stCaptionContainer"] {
        color: #9ca3af !important;
        font-size: 0.78rem !important;
        letter-spacing: 0.01em;
    }

    /* Paragraph text */
    .stMarkdown p {
        color: #374151 !important;
        font-size: 0.88rem !important;
        line-height: 1.6 !important;
    }

    /* ── Metric cards ───────────────────────────────── */
    [data-testid="stMetric"] {
        background: white !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 12px !important;
        padding: 20px 24px !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) !important;
        transition: box-shadow 200ms ease, transform 200ms ease !important;
    }
    [data-testid="stMetric"]:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04) !important;
        transform: translateY(-1px);
    }
    [data-testid="stMetricLabel"] {
        font-size: 0.72rem !important;
        color: #6b7280 !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.06em !important;
    }
    [data-testid="stMetricLabel"] > div > div {
        font-size: 0.72rem !important;
        color: #6b7280 !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.06em !important;
    }
    [data-testid="stMetricValue"] {
        font-size: 1.75rem !important;
        font-weight: 700 !important;
        color: #111827 !important;
        letter-spacing: -0.02em !important;
    }
    [data-testid="stMetricValue"] > div {
        font-size: 1.75rem !important;
        font-weight: 700 !important;
        color: #111827 !important;
    }
    [data-testid="stMetricDelta"] {
        font-size: 0.75rem !important;
        font-weight: 600 !important;
    }
    [data-testid="stMetricDelta"] svg {
        width: 12px !important;
        height: 12px !important;
    }

    /* ── Chart containers ───────────────────────────── */
    [data-testid="stPlotlyChart"],
    [data-testid="stVegaLiteChart"],
    [data-testid="stArrowVegaLiteChart"],
    .stPlotlyChart {
        background: white !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 12px !important;
        padding: 16px !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) !important;
        overflow: hidden !important;
    }

    /* Plotly modebar — subtle, only on hover */
    .modebar-container {
        opacity: 0 !important;
        transition: opacity 200ms ease !important;
    }
    [data-testid="stPlotlyChart"]:hover .modebar-container,
    .stPlotlyChart:hover .modebar-container {
        opacity: 0.6 !important;
    }
    .modebar-btn {
        font-size: 14px !important;
    }

    /* Plotly chart inner — transparent bg */
    .js-plotly-plot .plotly .main-svg {
        background: transparent !important;
    }
    .js-plotly-plot .plotly .bg {
        fill: transparent !important;
    }

    /* ── Tables / DataFrames ────────────────────────── */
    [data-testid="stDataFrame"],
    .stDataFrame {
        background: white !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) !important;
    }
    [data-testid="stDataFrame"] thead th,
    .stDataFrame thead th,
    [data-testid="stDataFrame"] .col_heading {
        background: #f3f4f6 !important;
        font-weight: 600 !important;
        font-size: 0.72rem !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        color: #6b7280 !important;
        padding: 10px 14px !important;
        border-bottom: 1px solid #e5e7eb !important;
    }
    [data-testid="stDataFrame"] td,
    .stDataFrame td {
        font-size: 0.82rem !important;
        color: #374151 !important;
        padding: 8px 14px !important;
        border-bottom: 1px solid #f3f4f6 !important;
    }
    /* Glide data grid (Streamlit's newer table renderer) */
    [data-testid="stDataFrame"] canvas + div {
        border-radius: 12px !important;
    }

    /* ── Buttons ─────────────────────────────────────── */
    .stButton > button,
    .stDownloadButton > button {
        border-radius: 8px !important;
        font-weight: 500 !important;
        font-size: 0.82rem !important;
        padding: 0.45rem 1rem !important;
        transition: all 150ms ease !important;
        border: 1px solid #e5e7eb !important;
        background: white !important;
        color: #374151 !important;
    }
    .stButton > button:hover,
    .stDownloadButton > button:hover {
        background: #f9fafb !important;
        border-color: #d1d5db !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important;
    }
    .stButton > button[kind="primary"],
    .stButton > button[data-testid="stBaseButton-primary"],
    button[data-testid="stBaseButton-primary"] {
        background: #2563eb !important;
        border: none !important;
        color: white !important;
        font-weight: 600 !important;
        box-shadow: 0 1px 3px rgba(37,99,235,0.3) !important;
    }
    .stButton > button[kind="primary"]:hover,
    .stButton > button[data-testid="stBaseButton-primary"]:hover,
    button[data-testid="stBaseButton-primary"]:hover {
        background: #1d4ed8 !important;
        box-shadow: 0 2px 6px rgba(37,99,235,0.35) !important;
    }

    /* ── Tabs ────────────────────────────────────────── */
    .stTabs [data-baseweb="tab-list"] {
        gap: 0 !important;
        border-bottom: 2px solid #f3f4f6 !important;
        background: transparent !important;
    }
    .stTabs [data-baseweb="tab"] {
        font-weight: 500 !important;
        font-size: 0.82rem !important;
        color: #6b7280 !important;
        padding: 0.6rem 1.2rem !important;
        border-bottom: 2px solid transparent !important;
        margin-bottom: -2px !important;
        transition: all 150ms ease !important;
        background: transparent !important;
    }
    .stTabs [data-baseweb="tab"]:hover {
        color: #111827 !important;
        background: #f9fafb !important;
    }
    .stTabs [data-baseweb="tab"][aria-selected="true"] {
        color: #2563eb !important;
        font-weight: 600 !important;
        border-bottom-color: #2563eb !important;
        background: transparent !important;
    }
    /* Hide baseweb tab highlight bar (we use border-bottom instead) */
    .stTabs [data-baseweb="tab-highlight"] {
        display: none !important;
    }
    .stTabs [data-baseweb="tab-border"] {
        display: none !important;
    }

    /* ── Expanders ───────────────────────────────────── */
    [data-testid="stExpander"] {
        background: white !important;
        border: 1px solid #e5e7eb !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.02) !important;
    }
    [data-testid="stExpander"] summary {
        font-weight: 500 !important;
        font-size: 0.85rem !important;
        color: #374151 !important;
        padding: 12px 16px !important;
    }
    [data-testid="stExpander"] summary:hover {
        color: #111827 !important;
        background: #f9fafb !important;
    }
    [data-testid="stExpander"] [data-testid="stExpanderDetails"] {
        padding: 0 16px 16px 16px !important;
    }

    /* ── Inputs & selectors ──────────────────────────── */
    .stSelectbox label, .stMultiSelect label, .stTextInput label,
    .stNumberInput label, .stDateInput label, .stTextArea label,
    .stSlider label, .stRadio label, .stCheckbox label {
        font-size: 0.78rem !important;
        font-weight: 600 !important;
        color: #6b7280 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.04em !important;
        margin-bottom: 4px !important;
    }
    /* Baseweb input containers */
    [data-baseweb="select"] > div,
    [data-baseweb="input"] > div,
    .stTextInput > div > div,
    .stNumberInput > div > div,
    .stDateInput > div > div {
        border-radius: 8px !important;
        border-color: #e5e7eb !important;
        background: white !important;
        font-size: 0.85rem !important;
        transition: border-color 150ms ease, box-shadow 150ms ease !important;
    }
    [data-baseweb="select"] > div:focus-within,
    [data-baseweb="input"] > div:focus-within,
    .stTextInput > div > div:focus-within {
        border-color: #2563eb !important;
        box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important;
    }
    /* Dropdown menu */
    [data-baseweb="popover"] [data-baseweb="menu"] {
        border-radius: 10px !important;
        border: 1px solid #e5e7eb !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04) !important;
        overflow: hidden !important;
    }
    [data-baseweb="menu"] li {
        font-size: 0.85rem !important;
        padding: 8px 14px !important;
    }
    [data-baseweb="menu"] li:hover {
        background: #f3f4f6 !important;
    }

    /* Slider */
    .stSlider [data-baseweb="slider"] [role="slider"] {
        background: #2563eb !important;
        border-color: #2563eb !important;
        width: 16px !important;
        height: 16px !important;
    }
    .stSlider [data-testid="stThumbValue"] {
        font-size: 0.72rem !important;
        font-weight: 600 !important;
        color: #2563eb !important;
    }

    /* ── Alerts / Info boxes ─────────────────────────── */
    .stAlert, [data-testid="stAlert"] {
        border-radius: 10px !important;
        font-size: 0.85rem !important;
        border-left-width: 4px !important;
        padding: 12px 16px !important;
    }

    /* ── Sidebar (hidden in embedded mode) ───────────── */
    [data-testid="stSidebar"],
    [data-testid="collapsedControl"] {
        display: none !important;
    }

    /* ── Dividers ────────────────────────────────────── */
    hr {
        border: none !important;
        height: 1px !important;
        background: #e5e7eb !important;
        margin: 1.25rem 0 !important;
        opacity: 0.7 !important;
    }

    /* ── Scrollbar — slim & unobtrusive ─────────────── */
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 999px; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

    /* ── Spinner / loading ──────────────────────────── */
    .stSpinner > div { border-top-color: #2563eb !important; }

    /* ── Toast messages ─────────────────────────────── */
    [data-testid="stToast"] {
        border-radius: 10px !important;
        box-shadow: 0 4px 16px rgba(0,0,0,0.1) !important;
    }

    /* ── Code blocks ────────────────────────────────── */
    .stCodeBlock, code {
        border-radius: 8px !important;
        font-size: 0.8rem !important;
    }

    /* ── Multiselect tags ───────────────────────────── */
    [data-baseweb="tag"] {
        border-radius: 6px !important;
        font-size: 0.78rem !important;
        background: #eff6ff !important;
        color: #2563eb !important;
    }

    /* ── Progress bar ───────────────────────────────── */
    .stProgress > div > div {
        background: #2563eb !important;
        border-radius: 999px !important;
    }

    /* ── Radio & checkbox ───────────────────────────── */
    .stRadio > div { gap: 0.5rem !important; }
    .stRadio label, .stCheckbox label {
        font-size: 0.85rem !important;
        color: #374151 !important;
        text-transform: none !important;
    }
</style>
""", unsafe_allow_html=True)


def show_error(error: Exception):
    """Display a user-friendly error message."""
    st.error("An error occurred while generating your dashboard")
    with st.expander("Error Details", expanded=False):
        st.code(str(error))
        st.code(type(error).__name__)


def main():
    """Main function to run the dashboard."""
    # Check if a code file was provided
    if len(sys.argv) < 2:
        st.title("Ready for Analysis")
        st.info(
            "Enter a natural language query in the app above to generate "
            "an interactive dashboard from your BigQuery data."
        )
        st.markdown("""
        ### Example Queries
        - "Show me monthly revenue trends as a line chart"
        - "Compare sales by region in a bar chart"
        - "Display the top 10 products by order count"
        - "What is the distribution of order values?"
        """)
        return

    code_file = sys.argv[1]

    if not os.path.exists(code_file):
        st.error(f"Code file not found: {code_file}")
        return

    try:
        # Read and execute the generated code
        with open(code_file, 'r') as f:
            code = f.read()

        # Create a local namespace for execution
        local_namespace = {
            '__name__': '__main__',
            '__file__': code_file,
        }

        # Execute the generated code
        exec(code, local_namespace)

    except SyntaxError as e:
        st.error("Syntax error in generated code")
        with st.expander("Error Details"):
            st.code(f"Line {e.lineno}: {e.text}")
            st.code(str(e))

    except ImportError as e:
        st.error(f"Missing dependency: {e.name}")
        st.info("Please ensure all required packages are installed.")

    except Exception as e:
        show_error(e)


if __name__ == "__main__":
    main()
