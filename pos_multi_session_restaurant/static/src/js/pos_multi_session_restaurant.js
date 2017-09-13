odoo.define('pos_multi_session_restaurant', function(require){
    var screens = require('point_of_sale.screens');
    var models = require('point_of_sale.models');
    var multiprint = require('pos_restaurant.multiprint');
    var floors = require('pos_restaurant.floors');
    var core = require('web.core');
    var gui = require('point_of_sale.gui');
    var chrome = require('point_of_sale.chrome');
    var multi_session = require('pos_multi_session');

    var FloorScreenWidget;
    _.each(gui.Gui.prototype.screen_classes, function(o){
        if (o.name == 'floors'){
            FloorScreenWidget = o.widget;
            FloorScreenWidget.include({
                start: function () {
                    var self = this;
                    this._super();
                    this.pos.bind('change:orders-count-on-floor-screen', function () {
                        self.renderElement();
                    });
                }
            });
            return false;
        }
    });
    var _t = core._t;

    models.load_models({
        model: 'pos.multi_session',
        fields: ['name','floor_ids'],
        domain: null,
        loaded: function(self,floors){
//            if (self.floors){
//                self.floors = floors.concat()
//            }
            self.multi_session_floors = floors[0];
        },
    });

//    models.load_models({
//        model: 'restaurant.floor',
//        fields: ['name','background_color','table_ids','sequence'],
//        domain: function(self){ return [['pos_config_id','=',self.config.id]]; },
//        loaded: function(self,floors){
//            self.floors = floors;
//            self.floors_by_id = {};
//            for (var i = 0; i < floors.length; i++) {
//                floors[i].tables = [];
//                self.floors_by_id[floors[i].id] = floors[i];
//            }
//
//            // Make sure they display in the correct order
//            self.floors = self.floors.sort(function(a,b){ return a.sequence - b.sequence; });
//
//            // Ignore floorplan features if no floor specified.
//            self.config.iface_floorplan = !!self.floors.length;
//        },
//    });
    gui.Gui.prototype.screen_classes.filter(function(el) {
        return el.name == 'splitbill'
    })[0].widget.include({
        pay: function(order,neworder,splitlines){
            this._super(order,neworder,splitlines);
            neworder.save_to_db();
        }
    });

    screens.OrderWidget.include({
        update_summary: function(){
            var order = this.pos.get('selectedOrder');
            if (!order){
                return;
            }
            this._super();
        },
        remove_orderline: function(order_line){
            if (this.pos.get_order() && this.pos.get_order().get_orderlines().length === 0){
                this._super(order_line);
            }
            else {
                order_line.node.parentNode.removeChild(order_line.node);
            }
        }
    });

    var PosModelSuper = models.PosModel;
    models.PosModel = models.PosModel.extend({
        initialize: function(){
            var floor_model = _.find(this.models, function(model){ return model.model === 'restaurant.floor'; });
            var ms_floor_model = _.find(this.models, function(model){ return model.model === 'pos.multi_session'; });
//            this.multi_session.floor_ids = this.multi_session_floors[0].floor_ids;
//            ms_floor_model.domain = function(self){
////                self.multi_session.floor_ids = self.multi_session_floors[0].floor_ids;
//                var temporary = [['id','in',self.multi_session.floor_ids]];
//                return temporary[0][2].length > 0 ? temporary : [['id','in',self.config.multi_session_no_id_floor_ids]];
//            }
            floor_model.domain = function(self){
                    var temporary = [['id','in',self.config.floor_ids]];
                    var temp1 = [['id','in',self.config.floor_ids]];
                    var temp2 = [['id','in',self.multi_session.floor_ids]];
                    var temp3 = [['id','in',self.multi_session_floors]];
                    return temporary[0][2].length > 0 ? temporary : [['id','in',self.config.multi_session.floor_ids]];
                };
            var self = this;
            PosModelSuper.prototype.initialize.apply(this, arguments);
            this.ready.then(function () {
                if (!self.config.multi_session_id){
                    return;
                }

                self.multi_session.floor_ids = self.multi_session_floors.floor_ids;
                self.config.floor_ids = self.multi_session.floor_ids;

                var remove_order_super = Object.getPrototypeOf(self.multi_session).remove_order;
                self.multi_session.remove_order = function(data) {
                    if (data.transfer) {
                        data.transfer = false;
                        return;
                    } else {
                        remove_order_super.apply(self.multi_session, arguments);
                    }
                 };
            });
        },
        add_new_order: function(){
            var self = this;
            PosModelSuper.prototype.add_new_order.apply(this, arguments);
            if (this.multi_session){
                var current_order = this.get_order();
                if (!this.config.multi_session_id){
                    current_order.save_to_db();
                    return;
                }
                current_order.ms_update();
                current_order.save_to_db();
            }
        },
        ms_create_order: function(options){
            var self = this;
            var order = PosModelSuper.prototype.ms_create_order.apply(this, arguments);
            if (options.data.table_id) {
                order.table = self.tables_by_id[options.data.table_id];
                order.customer_count = options.data.customer_count;
                order.save_to_db();
            }
            return order;
        },
        ms_on_update: function(message, sync_all){
            var self = this;
            var data = message.data || {};
            var order = false;
            var old_order = this.get_order();

            if (data.uid){
                order = this.get('orders').find(function(order){
                    return order.uid == data.uid;
                });
            }
            if (order && order.table.id != data.table_id) {
                order.transfer = true;
                order.destroy({'reason': 'abandon'});
            }
            PosModelSuper.prototype.ms_on_update.apply(this, arguments);
            if ((order && old_order && old_order.uid != order.uid) || (old_order == null)) {
                this.set('selectedOrder',old_order);
            }
        },
        ms_do_update: function(order, data){
            PosModelSuper.prototype.ms_do_update.apply(this, arguments);
            if (order) {
                order.set_customer_count(data.customer_count, true);
                order.saved_resume = data.multiprint_resume;
                order.trigger('change');
                this.gui.screen_instances.floors.renderElement();
            }
        },
        ms_on_add_order: function(current_order){
            if (!current_order){
                this.trigger('change:orders-count-on-floor-screen');
            }else{
                PosModelSuper.prototype.ms_on_add_order.apply(this, arguments);
            }
        },
        on_removed_order: function(removed_order, index, reason){
            PosModelSuper.prototype.on_removed_order.apply(this, arguments);
            this.trigger('change:orders-count-on-floor-screen');
        },
        // changes the current table.
        set_table: function(table) {
            var self = this;
            if (table && this.order_to_transfer_to_different_table) {
                this.order_to_transfer_to_different_table.table = table;
                this.order_to_transfer_to_different_table.ms_update();
                this.order_to_transfer_to_different_table = null;
                // set this table
                this.set_table(table);
            } else {
                PosModelSuper.prototype.set_table.apply(this, arguments);
            }
        }
    });

    var OrderSuper = models.Order;
    models.Order = models.Order.extend({
        set_customer_count: function (count, skip_ms_update) {
            OrderSuper.prototype.set_customer_count.apply(this, arguments);
            if (!skip_ms_update) {
                this.ms_update();
            }
        },
        do_ms_remove_order: function(){
            if (this.transfer) {
                this.pos.multi_session.remove_order({
                    'uid': this.uid,
                    'revision_ID': this.revision_ID,
                    'transfer': this.transfer
                });
            } else {
                OrderSuper.prototype.do_ms_remove_order.apply(this, arguments);
            }
        },
    });

    var OrderlineSuper = models.Orderline;
    models.Orderline = models.Orderline.extend({
        get_line_diff_hash: function(){
            if (this.get_note()) {
                return this.uid + '|' + this.get_note();
            } else {
                return '' + this.uid;
            }
        },
    });
});
