use std::{
    collections::HashSet,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex},
};

use crate::{
    domain::{OrderRecord, ReceiptRecord},
    dto::{
        LegacyDateInput, LegacyOrderRecord, LegacyReceiptRecord, MemoryRecord, OrderListRequest,
        OrderListResponse, OrderMutationRequest, ReceiptListRequest, ReceiptListResponse,
        ReceiptStatusRequest,
    },
    AppError, AppResult,
};

pub type ServiceFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

pub trait OrderService: Send + Sync {
    fn list<'a>(
        &'a self,
        input: OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<OrderListResponse>>;

    fn detail<'a>(
        &'a self,
        order_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyOrderRecord>>>;

    fn create<'a>(&'a self, input: OrderMutationRequest) -> ServiceFuture<'a, AppResult<()>>;

    fn update<'a>(
        &'a self,
        order_id: i64,
        input: OrderMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove<'a>(&'a self, order_id: i64) -> ServiceFuture<'a, AppResult<()>>;
}

pub trait ReceiptService: Send + Sync {
    fn list<'a>(
        &'a self,
        input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>>;

    fn not_recovery<'a>(
        &'a self,
        input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>>;

    fn recovery<'a>(
        &'a self,
        input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>>;

    fn update_status<'a>(
        &'a self,
        receipt_id: i64,
        input: ReceiptStatusRequest,
    ) -> ServiceFuture<'a, AppResult<&'static str>>;
}

pub trait MemoryService: Send + Sync {
    fn list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>>;
}

pub trait OrderStore: Send + Sync {
    fn list<'a>(
        &'a self,
        input: &'a OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<OrderRecord>>>;

    fn count<'a>(&'a self, input: &'a OrderListRequest) -> ServiceFuture<'a, AppResult<usize>>;

    fn find_order<'a>(&'a self, order_id: i64)
        -> ServiceFuture<'a, AppResult<Option<OrderRecord>>>;

    fn create_order<'a>(&'a self, input: NormalizedOrderInput) -> ServiceFuture<'a, AppResult<()>>;

    fn update_order<'a>(
        &'a self,
        order_id: i64,
        input: NormalizedOrderInput,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn remove_order<'a>(&'a self, order_id: i64) -> ServiceFuture<'a, AppResult<()>>;

    fn list_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<ReceiptRecord>>>;

    fn count_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<usize>>;

    fn update_receipt_status<'a>(
        &'a self,
        receipt_id: i64,
        input: ReceiptStatusChange,
    ) -> ServiceFuture<'a, AppResult<()>>;

    fn list_memories<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedOrderInput {
    pub oddnumber: String,
    pub billing_at: i64,
    pub consignee: String,
    pub consigneephone: String,
    pub address: String,
    pub method: String,
    pub goodsname: String,
    pub number: String,
    pub pack: String,
    pub weight: String,
    pub measurement: String,
    pub cainsurance: String,
    pub value: String,
    pub insurance: String,
    pub consignor: String,
    pub consignorphone: String,
    pub freight: String,
    pub delivery: String,
    pub sumfreight: String,
    pub freightstate: String,
    pub paynow: String,
    pub paygo: String,
    pub payback: String,
    pub paymonth: String,
    pub receiptnum: i64,
    pub company: String,
    pub remarks: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceiptStatusChange {
    Recovery(String),
    Issue(String),
    Post(String),
}

pub struct CompatOrderService {
    store: Arc<dyn OrderStore>,
}

impl CompatOrderService {
    pub fn new(store: Arc<dyn OrderStore>) -> Self {
        Self { store }
    }
}

impl OrderService for CompatOrderService {
    fn list<'a>(
        &'a self,
        input: OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<OrderListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let list = store
                .list(&input)
                .await?
                .into_iter()
                .map(LegacyOrderRecord::from)
                .collect();
            let total_count = store.count(&input).await?;
            Ok(OrderListResponse { list, total_count })
        })
    }

    fn detail<'a>(
        &'a self,
        order_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyOrderRecord>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            Ok(store
                .find_order(order_id)
                .await?
                .map(LegacyOrderRecord::from))
        })
    }

    fn create<'a>(&'a self, input: OrderMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.create_order(normalize_order(input)?).await })
    }

    fn update<'a>(
        &'a self,
        order_id: i64,
        input: OrderMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.update_order(order_id, normalize_order(input)?).await })
    }

    fn remove<'a>(&'a self, order_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.remove_order(order_id).await })
    }
}

pub struct CompatReceiptService {
    store: Arc<dyn OrderStore>,
}

impl CompatReceiptService {
    pub fn new(store: Arc<dyn OrderStore>) -> Self {
        Self { store }
    }
}

pub struct CompatMemoryService {
    store: Arc<dyn OrderStore>,
}

impl CompatMemoryService {
    pub fn new(store: Arc<dyn OrderStore>) -> Self {
        Self { store }
    }
}

impl MemoryService for CompatMemoryService {
    fn list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { store.list_memories().await })
    }
}

impl ReceiptService for CompatReceiptService {
    fn list<'a>(
        &'a self,
        input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move { receipt_list_response(store.as_ref(), input).await })
    }

    fn not_recovery<'a>(
        &'a self,
        mut input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            input.recoverystate = Some("未回收".to_owned());
            receipt_list_response(store.as_ref(), input).await
        })
    }

    fn recovery<'a>(
        &'a self,
        mut input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            input.recoverystate = Some("已回收".to_owned());
            receipt_list_response(store.as_ref(), input).await
        })
    }

    fn update_status<'a>(
        &'a self,
        receipt_id: i64,
        input: ReceiptStatusRequest,
    ) -> ServiceFuture<'a, AppResult<&'static str>> {
        let store = Arc::clone(&self.store);
        Box::pin(async move {
            let (change, message) = normalize_receipt_status(input)?;
            store.update_receipt_status(receipt_id, change).await?;
            Ok(message)
        })
    }
}

async fn receipt_list_response(
    store: &dyn OrderStore,
    input: ReceiptListRequest,
) -> AppResult<ReceiptListResponse> {
    let list = store
        .list_receipts(&input)
        .await?
        .into_iter()
        .map(LegacyReceiptRecord::from)
        .collect();
    let total_count = store.count_receipts(&input).await?;
    Ok(ReceiptListResponse { list, total_count })
}

#[derive(Debug, Default)]
pub struct DisabledOrderService;

impl OrderService for DisabledOrderService {
    fn list<'a>(
        &'a self,
        _input: OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<OrderListResponse>> {
        Box::pin(async {
            Err(AppError::Database("订单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn detail<'a>(
        &'a self,
        _order_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<LegacyOrderRecord>>> {
        Box::pin(async {
            Err(AppError::Database("订单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn create<'a>(&'a self, _input: OrderMutationRequest) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("订单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update<'a>(
        &'a self,
        _order_id: i64,
        _input: OrderMutationRequest,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("订单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn remove<'a>(&'a self, _order_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async {
            Err(AppError::Database("订单服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledReceiptService;

impl ReceiptService for DisabledReceiptService {
    fn list<'a>(
        &'a self,
        _input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        Box::pin(async {
            Err(AppError::Database("回单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn not_recovery<'a>(
        &'a self,
        _input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        Box::pin(async {
            Err(AppError::Database("回单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn recovery<'a>(
        &'a self,
        _input: ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<ReceiptListResponse>> {
        Box::pin(async {
            Err(AppError::Database("回单服务尚未连接数据库仓储".to_owned()))
        })
    }

    fn update_status<'a>(
        &'a self,
        _receipt_id: i64,
        _input: ReceiptStatusRequest,
    ) -> ServiceFuture<'a, AppResult<&'static str>> {
        Box::pin(async {
            Err(AppError::Database("回单服务尚未连接数据库仓储".to_owned()))
        })
    }
}

#[derive(Debug, Default)]
pub struct DisabledMemoryService;

impl MemoryService for DisabledMemoryService {
    fn list<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>> {
        Box::pin(async {
            Err(AppError::Database(
                "记忆词条服务尚未连接数据库仓储".to_owned(),
            ))
        })
    }
}

#[derive(Debug)]
pub struct InMemoryOrderStore {
    orders: Mutex<Vec<OrderRecord>>,
    receipts: Mutex<Vec<ReceiptRecord>>,
    company_orders: Mutex<Vec<(String, i64)>>,
    memories: Mutex<HashSet<String>>,
    next_order_id: Mutex<i64>,
    next_receipt_id: Mutex<i64>,
}

impl InMemoryOrderStore {
    pub fn with_seed_data() -> Self {
        Self {
            orders: Mutex::new(vec![
                sample_order(
                    1,
                    "YD20260101001",
                    1_767_225_600_000,
                    "张三",
                    "李四",
                    "顺丰速运",
                    1,
                ),
                sample_order(
                    2,
                    "YD20260102001",
                    1_767_312_000_000,
                    "王五",
                    "赵六",
                    "德邦物流",
                    0,
                ),
            ]),
            receipts: Mutex::new(vec![
                ReceiptRecord::new(
                    1,
                    "YD20260101001",
                    1_767_225_600_000,
                    "未回收",
                    "未发放",
                    "未寄出",
                    1,
                    "李四",
                    "张三",
                    "配件",
                    "10",
                ),
                ReceiptRecord::new(
                    2,
                    "YD20251231001",
                    1_767_139_200_000,
                    "已回收",
                    "已发放",
                    "已寄出",
                    2,
                    "赵六",
                    "王五",
                    "设备",
                    "2",
                ),
            ]),
            company_orders: Mutex::new(vec![
                ("顺丰速运".to_owned(), 1),
                ("德邦物流".to_owned(), 2),
            ]),
            memories: Mutex::new(HashSet::from([
                "张三".to_owned(),
                "李四".to_owned(),
                "王五".to_owned(),
                "赵六".to_owned(),
            ])),
            next_order_id: Mutex::new(3),
            next_receipt_id: Mutex::new(3),
        }
    }

    pub fn snapshot(&self) -> InMemoryOrderSnapshot {
        InMemoryOrderSnapshot {
            order_count: self
                .orders
                .lock()
                .map(|orders| orders.len())
                .unwrap_or_default(),
            receipt_count: self
                .receipts
                .lock()
                .map(|receipts| receipts.len())
                .unwrap_or_default(),
            company_orders: self
                .company_orders
                .lock()
                .map(|items| items.clone())
                .unwrap_or_default(),
            memories: self
                .memories
                .lock()
                .map(|items| items.clone())
                .unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InMemoryOrderSnapshot {
    pub order_count: usize,
    pub receipt_count: usize,
    pub company_orders: Vec<(String, i64)>,
    pub memories: HashSet<String>,
}

impl Default for InMemoryOrderStore {
    fn default() -> Self {
        Self {
            orders: Mutex::new(Vec::new()),
            receipts: Mutex::new(Vec::new()),
            company_orders: Mutex::new(Vec::new()),
            memories: Mutex::new(HashSet::new()),
            next_order_id: Mutex::new(1),
            next_receipt_id: Mutex::new(1),
        }
    }
}

impl OrderStore for InMemoryOrderStore {
    fn list<'a>(
        &'a self,
        input: &'a OrderListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<OrderRecord>>> {
        Box::pin(async move {
            Ok(
                filter_orders(&self.orders.lock().map_err(|_| AppError::Internal)?, input)
                    .into_iter()
                    .skip(input.offset)
                    .take(input.size)
                    .collect(),
            )
        })
    }

    fn count<'a>(&'a self, input: &'a OrderListRequest) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            Ok(filter_orders(&self.orders.lock().map_err(|_| AppError::Internal)?, input).len())
        })
    }

    fn find_order<'a>(
        &'a self,
        order_id: i64,
    ) -> ServiceFuture<'a, AppResult<Option<OrderRecord>>> {
        Box::pin(async move {
            Ok(self
                .orders
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .find(|order| order.id == order_id)
                .cloned())
        })
    }

    fn create_order<'a>(&'a self, input: NormalizedOrderInput) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut next_order_id = self.next_order_id.lock().map_err(|_| AppError::Internal)?;
            let order_id = *next_order_id;
            *next_order_id += 1;
            self.orders
                .lock()
                .map_err(|_| AppError::Internal)?
                .push(order_from_input(order_id, &input));
            self.company_orders
                .lock()
                .map_err(|_| AppError::Internal)?
                .push((input.company.clone(), order_id));
            if input.receiptnum > 0 {
                self.create_or_update_receipt_from_order(&input, None)?;
            }
            self.insert_memory(&input.consignee)?;
            self.insert_memory(&input.consignor)?;
            Ok(())
        })
    }

    fn update_order<'a>(
        &'a self,
        order_id: i64,
        input: NormalizedOrderInput,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut orders = self.orders.lock().map_err(|_| AppError::Internal)?;
            let order = orders
                .iter_mut()
                .find(|order| order.id == order_id)
                .ok_or_else(|| AppError::NotFound(format!("order {order_id}")))?;
            *order = order_from_input(order_id, &input);
            drop(orders);

            let mut company_orders = self.company_orders.lock().map_err(|_| AppError::Internal)?;
            if let Some((company, _)) = company_orders
                .iter_mut()
                .find(|(_, existing_order_id)| *existing_order_id == order_id)
            {
                *company = input.company.clone();
            } else {
                company_orders.push((input.company.clone(), order_id));
            }
            drop(company_orders);

            if input.receiptnum > 0 {
                self.create_or_update_receipt_from_order(&input, Some(input.oddnumber.as_str()))?;
            }
            self.insert_memory(&input.consignee)?;
            self.insert_memory(&input.consignor)?;
            Ok(())
        })
    }

    fn remove_order<'a>(&'a self, order_id: i64) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut orders = self.orders.lock().map_err(|_| AppError::Internal)?;
            let removed_order = orders
                .iter()
                .find(|order| order.id == order_id)
                .cloned()
                .ok_or_else(|| AppError::NotFound(format!("order {order_id}")))?;
            orders.retain(|order| order.id != order_id);
            let same_oddnumber_still_exists = orders
                .iter()
                .any(|order| order.oddnumber == removed_order.oddnumber);
            drop(orders);

            self.company_orders
                .lock()
                .map_err(|_| AppError::Internal)?
                .retain(|(_, existing_order_id)| *existing_order_id != order_id);

            if !same_oddnumber_still_exists {
                self.receipts
                    .lock()
                    .map_err(|_| AppError::Internal)?
                    .retain(|receipt| receipt.oddnumber != removed_order.oddnumber);
            }
            Ok(())
        })
    }

    fn list_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<Vec<ReceiptRecord>>> {
        Box::pin(async move {
            Ok(filter_receipts(
                &self.receipts.lock().map_err(|_| AppError::Internal)?,
                input,
            )
            .into_iter()
            .skip(input.offset)
            .take(input.size)
            .collect())
        })
    }

    fn count_receipts<'a>(
        &'a self,
        input: &'a ReceiptListRequest,
    ) -> ServiceFuture<'a, AppResult<usize>> {
        Box::pin(async move {
            Ok(filter_receipts(
                &self.receipts.lock().map_err(|_| AppError::Internal)?,
                input,
            )
            .len())
        })
    }

    fn update_receipt_status<'a>(
        &'a self,
        receipt_id: i64,
        input: ReceiptStatusChange,
    ) -> ServiceFuture<'a, AppResult<()>> {
        Box::pin(async move {
            let mut receipts = self.receipts.lock().map_err(|_| AppError::Internal)?;
            let receipt = receipts
                .iter_mut()
                .find(|receipt| receipt.id == receipt_id)
                .ok_or_else(|| AppError::NotFound(format!("receipt {receipt_id}")))?;
            match input {
                ReceiptStatusChange::Recovery(value) => receipt.recoverystate = value,
                ReceiptStatusChange::Issue(value) => receipt.issuestate = value,
                ReceiptStatusChange::Post(value) => receipt.poststate = value,
            }
            Ok(())
        })
    }

    fn list_memories<'a>(&'a self) -> ServiceFuture<'a, AppResult<Vec<MemoryRecord>>> {
        Box::pin(async move {
            let mut list: Vec<_> = self
                .memories
                .lock()
                .map_err(|_| AppError::Internal)?
                .iter()
                .map(|value| MemoryRecord {
                    value: value.to_owned(),
                })
                .collect();
            list.sort_by(|left, right| left.value.cmp(&right.value));
            Ok(list)
        })
    }
}

impl InMemoryOrderStore {
    fn create_or_update_receipt_from_order(
        &self,
        input: &NormalizedOrderInput,
        previous_oddnumber: Option<&str>,
    ) -> AppResult<()> {
        let mut receipts = self.receipts.lock().map_err(|_| AppError::Internal)?;
        let receipt = receipts.iter_mut().find(|receipt| {
            previous_oddnumber
                .map(|oddnumber| receipt.oddnumber == oddnumber)
                .unwrap_or_else(|| receipt.oddnumber == input.oddnumber)
        });
        if let Some(receipt) = receipt {
            receipt.oddnumber = input.oddnumber.clone();
            receipt.recoverynumber = input.receiptnum;
            receipt.consignor = input.consignor.clone();
            receipt.consignee = input.consignee.clone();
            receipt.goodsname = input.goodsname.clone();
            receipt.goodsnumber = input.number.clone();
            return Ok(());
        }

        let mut next_receipt_id = self
            .next_receipt_id
            .lock()
            .map_err(|_| AppError::Internal)?;
        receipts.push(ReceiptRecord::new(
            *next_receipt_id,
            input.oddnumber.clone(),
            input.billing_at,
            "未回收",
            "未发放",
            "未寄出",
            input.receiptnum,
            input.consignor.clone(),
            input.consignee.clone(),
            input.goodsname.clone(),
            input.number.clone(),
        ));
        *next_receipt_id += 1;
        Ok(())
    }

    fn insert_memory(&self, value: &str) -> AppResult<()> {
        let value = value.trim();
        if !value.is_empty() {
            self.memories
                .lock()
                .map_err(|_| AppError::Internal)?
                .insert(value.to_owned());
        }
        Ok(())
    }
}

pub fn development_order_services() -> (
    CompatOrderService,
    CompatReceiptService,
    CompatMemoryService,
) {
    let store = Arc::new(InMemoryOrderStore::with_seed_data());
    (
        CompatOrderService::new(store.clone()),
        CompatReceiptService::new(store.clone()),
        CompatMemoryService::new(store),
    )
}

fn normalize_order(input: OrderMutationRequest) -> AppResult<NormalizedOrderInput> {
    let oddnumber = required(input.oddnumber, "运单号不能为空")?;
    Ok(NormalizedOrderInput {
        oddnumber,
        billing_at: input
            .billing_at
            .unwrap_or(LegacyDateInput::Millis(0))
            .as_legacy_millis(),
        consignee: required(input.consignee, "收货人不能为空")?,
        consigneephone: input.consigneephone.unwrap_or_default(),
        address: input.address.unwrap_or_default(),
        method: input.method.unwrap_or_default(),
        goodsname: input.goodsname.unwrap_or_default(),
        number: input.number.unwrap_or_default(),
        pack: input.pack.unwrap_or_default(),
        weight: input.weight.unwrap_or_default(),
        measurement: input.measurement.unwrap_or_default(),
        cainsurance: input.cainsurance.unwrap_or_default(),
        value: input.value.unwrap_or_default(),
        insurance: input.insurance.unwrap_or_default(),
        consignor: required(input.consignor, "发货人不能为空")?,
        consignorphone: input.consignorphone.unwrap_or_default(),
        freight: input.freight.unwrap_or_default(),
        delivery: input.delivery.unwrap_or_default(),
        sumfreight: input.sumfreight.unwrap_or_default(),
        freightstate: input.freightstate.unwrap_or_default(),
        paynow: input.paynow.unwrap_or_default(),
        paygo: input.paygo.unwrap_or_default(),
        payback: input.payback.unwrap_or_default(),
        paymonth: input.paymonth.unwrap_or_default(),
        receiptnum: input.receiptnum.unwrap_or_default(),
        company: input.company.unwrap_or_default(),
        remarks: input.remarks.unwrap_or_default(),
    })
}

fn required(value: Option<String>, message: &str) -> AppResult<String> {
    let value = value.unwrap_or_default().trim().to_owned();
    if value.is_empty() {
        return Err(AppError::Validation(message.to_owned()));
    }
    Ok(value)
}

fn normalize_receipt_status(
    input: ReceiptStatusRequest,
) -> AppResult<(ReceiptStatusChange, &'static str)> {
    if let Some(value) = input.recoverystate.filter(|value| !value.trim().is_empty()) {
        return Ok((ReceiptStatusChange::Recovery(value), "回单回收成功！"));
    }
    if let Some(value) = input.issuestate.filter(|value| !value.trim().is_empty()) {
        return Ok((ReceiptStatusChange::Issue(value), "回单发放成功！"));
    }
    if let Some(value) = input.poststate.filter(|value| !value.trim().is_empty()) {
        return Ok((ReceiptStatusChange::Post(value), "回单寄出成功！"));
    }
    Err(AppError::Validation("回单状态不能为空".to_owned()))
}

fn order_from_input(id: i64, input: &NormalizedOrderInput) -> OrderRecord {
    OrderRecord::new(
        id,
        input.oddnumber.clone(),
        input.billing_at,
        input.consignee.clone(),
        input.consigneephone.clone(),
        input.address.clone(),
        input.method.clone(),
        input.goodsname.clone(),
        input.number.clone(),
        input.pack.clone(),
        input.weight.clone(),
        input.measurement.clone(),
        input.cainsurance.clone(),
        input.value.clone(),
        input.insurance.clone(),
        input.consignor.clone(),
        input.consignorphone.clone(),
        input.freight.clone(),
        input.delivery.clone(),
        input.sumfreight.clone(),
        input.freightstate.clone(),
        input.paynow.clone(),
        input.paygo.clone(),
        input.payback.clone(),
        input.paymonth.clone(),
        input.receiptnum,
        input.company.clone(),
        input.remarks.clone(),
    )
}

fn filter_orders(orders: &[OrderRecord], input: &OrderListRequest) -> Vec<OrderRecord> {
    let oddnumber = filter_text(&input.oddnumber);
    let consignee = filter_text(&input.consignee);
    let consigneephone = filter_text(&input.consigneephone);
    let number = filter_text(&input.number);
    let consignor = filter_text(&input.consignor);
    let consignorphone = filter_text(&input.consignorphone);
    let company = filter_text(&input.company);
    let date_range = parse_date_range(&input.create_at);
    let mut filtered: Vec<_> = orders
        .iter()
        .filter(|order| contains(&order.oddnumber, &oddnumber))
        .filter(|order| contains(&order.consignee, &consignee))
        .filter(|order| contains(&order.consigneephone, &consigneephone))
        .filter(|order| contains(&order.number, &number))
        .filter(|order| contains(&order.consignor, &consignor))
        .filter(|order| contains(&order.consignorphone, &consignorphone))
        .filter(|order| contains(&order.company, &company))
        .filter(|order| in_range(order.billing_at, date_range))
        .cloned()
        .collect();
    filtered.sort_by(|left, right| right.id.cmp(&left.id));
    filtered
}

fn filter_receipts(receipts: &[ReceiptRecord], input: &ReceiptListRequest) -> Vec<ReceiptRecord> {
    let oddnumber = filter_text(&input.oddnumber);
    let consignee = filter_text(&input.consignee);
    let consignor = filter_text(&input.consignor);
    let recoverystate = filter_text(&input.recoverystate);
    let issuestate = filter_text(&input.issuestate);
    let poststate = filter_text(&input.poststate);
    let date_range = parse_date_range(&input.create_at);
    let mut filtered: Vec<_> = receipts
        .iter()
        .filter(|receipt| contains(&receipt.oddnumber, &oddnumber))
        .filter(|receipt| contains(&receipt.consignee, &consignee))
        .filter(|receipt| contains(&receipt.consignor, &consignor))
        .filter(|receipt| contains(&receipt.recoverystate, &recoverystate))
        .filter(|receipt| contains(&receipt.issuestate, &issuestate))
        .filter(|receipt| contains(&receipt.poststate, &poststate))
        .filter(|receipt| in_range(receipt.billing_at, date_range))
        .cloned()
        .collect();
    filtered.sort_by(|left, right| right.id.cmp(&left.id));
    filtered
}

fn sample_order(
    id: i64,
    oddnumber: &str,
    billing_at: i64,
    consignee: &str,
    consignor: &str,
    company: &str,
    receiptnum: i64,
) -> OrderRecord {
    OrderRecord::new(
        id,
        oddnumber,
        billing_at,
        consignee,
        "",
        "测试地址",
        "送货",
        "配件",
        "10",
        "纸箱",
        "20",
        "1",
        "否",
        "",
        "",
        consignor,
        "",
        "100",
        "10",
        "110",
        "现付",
        "110",
        "",
        "",
        "",
        receiptnum,
        company,
        "",
    )
}

fn filter_text(value: &Option<String>) -> String {
    value.as_deref().unwrap_or("").trim().to_owned()
}

fn contains(value: &str, needle: &str) -> bool {
    needle.is_empty() || value.contains(needle)
}

fn parse_date_range(value: &Option<Vec<LegacyDateInput>>) -> Option<(i64, i64)> {
    let values = value.as_ref()?;
    let [start, end] = values.as_slice() else {
        return None;
    };
    Some((start.as_legacy_millis(), end.as_legacy_millis()))
}

fn in_range(value: i64, range: Option<(i64, i64)>) -> bool {
    range
        .map(|(start, end)| value >= start && value <= end)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use crate::{
        dto::{
            LegacyDateInput, OrderListRequest, OrderMutationRequest, ReceiptListRequest,
            ReceiptStatusRequest,
        },
        services::{development_order_services, MemoryService, OrderService, ReceiptService},
    };

    #[tokio::test]
    async fn order_create_writes_company_order_receipt_and_memory() {
        let (orders, receipts, memories) = development_order_services();
        orders
            .create(OrderMutationRequest {
                oddnumber: Some("YD20260701001".to_owned()),
                billing_at: Some(LegacyDateInput::Text("2026-07-01".to_owned())),
                consignee: Some("新收货人".to_owned()),
                consigneephone: None,
                address: Some("新地址".to_owned()),
                method: Some("送货".to_owned()),
                goodsname: Some("设备".to_owned()),
                number: Some("2".to_owned()),
                pack: Some("木箱".to_owned()),
                weight: None,
                measurement: None,
                cainsurance: None,
                value: None,
                insurance: None,
                consignor: Some("新发货人".to_owned()),
                consignorphone: None,
                freight: Some("100".to_owned()),
                delivery: Some("20".to_owned()),
                sumfreight: Some("120".to_owned()),
                freightstate: Some("现付".to_owned()),
                paynow: Some("120".to_owned()),
                paygo: None,
                payback: None,
                paymonth: None,
                receiptnum: Some(1),
                company: Some("顺丰速运".to_owned()),
                remarks: None,
            })
            .await
            .expect("order should create");

        let receipt_list = receipts
            .list(ReceiptListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some("YD20260701001".to_owned()),
                consignee: None,
                consignor: None,
                recoverystate: Some("未回收".to_owned()),
                issuestate: None,
                poststate: None,
                create_at: None,
            })
            .await
            .expect("receipt should list");
        assert_eq!(receipt_list.total_count, 1);
        assert_eq!(receipt_list.list[0].billing_at, "2026-07-01");
        assert!(memories
            .list()
            .await
            .expect("memories should list")
            .iter()
            .any(|record| record.value == "新收货人"));
    }

    #[tokio::test]
    async fn order_remove_cleans_company_order_and_receipt_links() {
        let store =
            std::sync::Arc::new(crate::services::order::InMemoryOrderStore::with_seed_data());
        let orders = crate::services::order::CompatOrderService::new(store.clone());
        let receipts = crate::services::order::CompatReceiptService::new(store.clone());

        orders.remove(1).await.expect("order should delete");

        let snapshot = store.snapshot();
        assert_eq!(snapshot.order_count, 1);
        assert_eq!(snapshot.receipt_count, 1);
        assert!(!snapshot
            .company_orders
            .iter()
            .any(|(_, order_id)| *order_id == 1));

        let receipt_list = receipts
            .list(ReceiptListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some("YD20260101001".to_owned()),
                consignee: None,
                consignor: None,
                recoverystate: None,
                issuestate: None,
                poststate: None,
                create_at: None,
            })
            .await
            .expect("receipt should list");
        assert_eq!(receipt_list.total_count, 0);
    }

    #[tokio::test]
    async fn order_list_filters_and_formats_legacy_dates() {
        let (orders, _, _) = development_order_services();
        let response = orders
            .list(OrderListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some("YD202601".to_owned()),
                consignee: Some("张".to_owned()),
                consigneephone: None,
                number: None,
                consignor: None,
                consignorphone: None,
                company: Some("顺丰".to_owned()),
                create_at: Some(vec![
                    LegacyDateInput::Text("2026-01-01".to_owned()),
                    LegacyDateInput::Text("2026-01-31".to_owned()),
                ]),
            })
            .await
            .expect("orders should list");

        assert_eq!(response.total_count, 1);
        assert_eq!(response.list[0].billing_at, "2026-01-01");
    }

    #[tokio::test]
    async fn receipt_status_update_uses_first_legacy_status_field() {
        let (_, receipts, _) = development_order_services();
        let message = receipts
            .update_status(
                1,
                ReceiptStatusRequest {
                    recoverystate: Some("已回收".to_owned()),
                    issuestate: Some("已发放".to_owned()),
                    poststate: None,
                },
            )
            .await
            .expect("status should update");

        assert_eq!(message, "回单回收成功！");
        let list = receipts
            .recovery(ReceiptListRequest {
                offset: 0,
                size: 10,
                oddnumber: Some("YD20260101001".to_owned()),
                consignee: None,
                consignor: None,
                recoverystate: None,
                issuestate: None,
                poststate: None,
                create_at: None,
            })
            .await
            .expect("recovery list should load");
        assert_eq!(list.total_count, 1);
    }
}
