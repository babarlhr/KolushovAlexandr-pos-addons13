# Copyright 2018 Ivan Yelizariev <https://it-projects.info/team/yelizariev>
# Copyright 2018 Dinar Gabbasov <https://it-projects.info/team/GabbasovDinar>
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
import logging
import json
try:
    from unittest.mock import patch
except ImportError:
    from mock import patch
from odoo.tests.common import HttpCase, HOST, PORT
from odoo import api

_logger = logging.getLogger(__name__)


class TestWeChatOrder(HttpCase):
    at_install = True
    post_install = True

    def setUp(self):
        super(TestWeChatOrder, self).setUp()

        self.phantom_env = api.Environment(self.registry.test_cr, self.uid, {})

        self.Order = self.phantom_env['wechat.order']
        self.product1 = self.phantom_env['product.product'].create({
            'name': 'Product1',
        })
        self.product2 = self.phantom_env['product.product'].create({
            'name': 'Product2',
        })

        patcher = patch('wechatpy.WeChatPay.check_signature', wraps=lambda *args: True)
        patcher.start()
        self.addCleanup(patcher.stop)

        self.lines = [
            {
                "product_id": self.product1.id,
                "name": "Product 1 Name",
                "quantity": 1,
                "price": 1,
                "category": "123456",
                "description": "翻译服务器错误",
            },
            {
                "product_id": self.product2.id,
                "name": "Product 2 Name",
                "quantity": 1,
                "price": 2,
                "category": "123456",
                "description": "網路白目哈哈",
            }
        ]

    def _patch_post(self, post_result):

        def post(url, data):
            self.assertIn(url, post_result)
            _logger.debug("Request data for %s: %s", url, data)
            return post_result[url]

        # patch wechat
        patcher = patch('wechatpy.pay.base.BaseWeChatPayAPI._post', wraps=post)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _create_order(self):
        post_result = {
            'pay/unifiedorder': {
                'code_url': 'weixin://wxpay/s/An4baqw',
                'trade_type': 'NATIVE',
                'result_code': 'SUCCESS',
            }
        }
        self._patch_post(post_result)
        order, code_url = self.Order._create_qr(self.lines, total_fee=300)
        self.assertEqual(order.state, 'draft', 'Just created order has wrong state')
        return order

    def _create_jsapi_order(self, openid, create_vals, lines):
        post_result = {
            'pay/unifiedorder': {
                'trade_type': 'JSAPI',
                'result_code': 'SUCCESS',
                'prepay_id': 'qweqweqwesadsd2113',
                'nonce_str': 'wsdasd12312eaqsd21q3'
            }
        }
        self._patch_post(post_result)
        res = self.phantom_env['wechat.order'].create_jsapi_order(openid, lines, create_vals)
        order = self.Order.browse(res.get('order_id'))
        self.assertEqual(order.state, 'draft', 'Just created order has wrong state')
        return res

    def test_native_payment(self):

        order = self._create_order()

        # simulate notification
        notification = {
            'return_code': 'SUCCESS',
            'result_code': 'SUCCESS',
            'out_trade_no': order.name,
        }
        handled = self.Order.on_notification(notification)
        self.assertTrue(handled, 'Notification was not handled (error in checking for duplicates?)')
        self.assertEqual(order.state, 'done', "Order's state is not changed after notification about update")

    def test_JSAPI_payment(self):
        # fake values for a test
        openid = 'qwe23e23oi2d393d2sad'
        create_vals = {}

        res = self._create_jsapi_order(openid=openid, create_vals=create_vals, lines=self.lines)

        data = res.get('data')
        order_id = res.get('order_id')
        order = self.Order.browse(order_id)

        self.assertIn('timeStamp', data, 'JSAPI payment: "timeStamp" not found in data')
        self.assertIn('nonceStr', data, 'JSAPI payment: "nonceStr" not found in data')
        self.assertIn('package', data, 'JSAPI payment: "package" not found in data')
        self.assertIn('signType', data, 'JSAPI payment: "signType" not found in data')
        self.assertIn('paySign', data, 'JSAPI payment: "paySign" not found in data')

        # simulate notification
        notification = {
            'return_code': 'SUCCESS',
            'result_code': 'SUCCESS',
            'out_trade_no': order.name,
        }

        handled = self.Order.on_notification(notification)
        self.assertTrue(handled, 'Notification was not handled (error in checking for duplicates?)')
        handled = self.Order.on_notification(notification)
        self.assertFalse(handled, 'Duplicate was not catched and handled as normal notificaiton')

    def test_notification_duplicates(self):
        order = self._create_order()

        # simulate notification with failing request
        notification = {
            'return_code': 'SUCCESS',
            'result_code': 'FAIL',
            'error_code': 'SYSTEMERR',
            # 'transaction_id': '121775250120121775250120',
            'out_trade_no': order.name,
        }
        handled = self.Order.on_notification(notification)
        self.assertTrue(handled, 'Notification was not handled (error in checking for duplicates?)')
        handled = self.Order.on_notification(notification)
        self.assertFalse(handled, 'Duplicate was not catched and handled as normal notificaiton')
