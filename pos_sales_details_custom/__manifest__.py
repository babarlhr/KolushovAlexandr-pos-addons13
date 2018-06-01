# Copyright 2018 Kolushov Alexandr <https://it-projects.info/team/KolushovAlexandr>
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
{
    "name": """Custom Sales Details""",
    "summary": """{SHORT_DESCRIPTION_OF_THE_MODULE}""",
    "category": "Point of Sale",
    # "live_test_url": "",
    "images": [],
    "version": "11.0.1.0.0",
    "application": False,

    "author": "IT-Projects LLC, Kolushov Alexandr",
    "support": "apps@it-projects.info",
    "website": "https://it-projects.info/team/KolushovAlexandr",
    "license": "LGPL-3",
    # "price": 9.00,
    # "currency": "EUR",

    "depends": [
        # "{DEPENDENCY1}",
        # "{DEPENDENCY2}",
    ],
    "external_dependencies": {"python": [], "bin": []},
    "data": [
        "views/sales_details_report.xml",
        # "{FILE2}.xml",
    ],
    "demo": [
        # "demo/{DEMOFILE1}.xml",
    ],
    "qweb": [
        # "static/src/xml/{QWEBFILE1}.xml",
    ],

    "post_load": None,
    "pre_init_hook": None,
    "post_init_hook": None,
    "uninstall_hook": None,

    "auto_install": False,
    "installable": True,
}
