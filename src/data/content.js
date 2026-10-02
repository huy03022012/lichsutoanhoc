// Dữ liệu học liệu dùng chung giữa API local và Vercel serverless functions.
// Mỗi bài gồm thông tin thẻ, nội dung chi tiết và các nguồn để đọc thêm.
export const lessons = [
    // Mỗi mục cần id duy nhất; key hỗ trợ tìm kiếm và sources là các liên kết đọc thêm.
    {
        id: "egypt",
        icon: "🏺",
        tag: "Lịch sử",
        title: "Toán học Ai Cập cổ đại",
        desc: "Khám phá những dấu vết sớm của tư duy Toán học và cách nó gắn với đời sống.",
        key: "ai cap co dai",
        introduction:
            "Ở Ai Cập cổ đại, toán học phát triển từ nhu cầu giải quyết những việc cụ thể: đo đạc ruộng đất sau mùa lũ sông Nile, xây dựng công trình và quản lý lương thực, thuế khóa.",
        sections: [
            {
                heading: "Toán học gắn với đời sống",
                text: "Người Ai Cập dùng các phép tính với số nguyên và phân số để chia phần, tính diện tích và thể tích. Họ biểu diễn số bằng các ký hiệu riêng; hệ thống này thuận tiện cho ghi chép nhưng khác với cách viết số thập phân theo vị trí ngày nay.",
            },
            {
                heading: "Các văn bản toán học",
                text: "Giấy cói Rhind, được chép vào khoảng thế kỷ 17 TCN từ một tài liệu cổ hơn, lưu lại nhiều bài toán về phân số, phép nhân, đo lường và phân chia lương thực. Đây là bằng chứng quan trọng giúp các nhà nghiên cứu tìm hiểu cách toán học được sử dụng thời đó.",
            },
            {
                heading: "Di sản và giới hạn của tư liệu",
                text: "Những văn bản còn lại cho thấy toán học Ai Cập thiên về phương pháp thực hành. Vì số tư liệu tồn tại có hạn, không nên suy rộng một bài toán riêng lẻ thành kết luận về toàn bộ kiến thức của người Ai Cập cổ đại.",
            },
        ],
        sources: [
            {
                title: "Toán học Ai Cập cổ đại — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/To%C3%A1n_h%E1%BB%8Dc_Ai_C%E1%BA%ADp_c%E1%BB%95_%C4%91%E1%BA%A1i",
            },
            {
                title: "Rhind Mathematical Papyrus — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/HistTopics/Egyptian_mathematics/",
            },
            {
                title: "Ancient Egyptian mathematics — Encyclopaedia Britannica",
                url: "https://www.britannica.com/science/mathematics/Ancient-Egypt",
            },
        ],
    },
    {
        id: "euclid",
        icon: "📐",
        tag: "Hình học",
        title: "Euclid và Cơ sở",
        desc: "Tìm hiểu vai trò của Euclid và cách các tiên đề tạo nền tảng cho hình học.",
        key: "euclid co so hinh hoc",
        introduction:
            "Euclid là nhà toán học hoạt động tại Alexandria vào khoảng năm 300 TCN. Tác phẩm Elements (Cơ sở) sắp xếp kiến thức hình học và số học thành một hệ thống có lập luận chặt chẽ.",
        sections: [
            {
                heading: "Từ định nghĩa đến chứng minh",
                text: "Elements bắt đầu bằng các định nghĩa, tiên đề và yêu cầu cơ bản, sau đó xây dựng từng mệnh đề bằng chứng minh. Cách tổ chức này giúp người đọc theo dõi vì sao một kết luận đúng thay vì chỉ ghi nhớ kết quả.",
            },
            {
                heading: "Nội dung của Elements",
                text: "Bộ sách gồm 13 quyển, đề cập đến hình học phẳng, tỉ lệ, số học và hình học không gian. Nội dung là sự hệ thống hóa tri thức toán học Hy Lạp trước đó; không phải mọi kết quả trong sách đều do Euclid tự phát hiện.",
            },
            {
                heading: "Ảnh hưởng lâu dài",
                text: "Elements được sao chép, dịch và dùng làm sách học trong nhiều thế kỷ. Phương pháp tiên đề của tác phẩm trở thành một hình mẫu quan trọng cho cách trình bày toán học.",
            },
        ],
        sources: [
            {
                title: "Cơ sở (Euclid) — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/C%C6%A1_s%E1%BB%9F_(Euclid)",
            },
            {
                title: "Euclid — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/Biographies/Euclid/",
            },
            {
                title: "Euclid's Elements — Encyclopaedia Britannica",
                url: "https://www.britannica.com/topic/Elements-by-Euclid",
            },
        ],
    },
    {
        id: "pythagoras",
        icon: "🌌",
        tag: "Cổ đại",
        title: "Pythagoras và định lý",
        desc: "Khám phá câu chuyện lịch sử xoay quanh một định lý quen thuộc.",
        key: "pythagoras dinh ly",
        introduction:
            "Pythagoras (khoảng thế kỷ 6 TCN) gắn với một cộng đồng triết học và tôn giáo nghiên cứu số học, âm nhạc và hình học. Tiểu sử của ông được ghi lại nhiều thế kỷ sau, nên cần phân biệt truyền thuyết với chứng cứ lịch sử.",
        sections: [
            {
                heading: "Định lý và các nền văn minh",
                text: "Quan hệ giữa ba cạnh của tam giác vuông đã xuất hiện trong nhiều nền văn minh trước thời Pythagoras. Bảng đất sét Babylon cho thấy người xưa biết các bộ ba số thỏa mãn quan hệ này, dù bằng chứng đó không đồng nghĩa họ trình bày chứng minh theo hình thức Hy Lạp.",
            },
            {
                heading: "Vì sao định lý mang tên Pythagoras?",
                text: "Tên gọi truyền thống phản ánh ảnh hưởng của trường phái Pythagoras đối với toán học Hy Lạp. Chứng minh tổng quát còn lại trong các tác phẩm toán học về sau; không có cơ sở chắc chắn để khẳng định cá nhân Pythagoras là người đầu tiên phát hiện mọi dạng của định lý.",
            },
            {
                heading: "Ý nghĩa toán học",
                text: "Định lý cho biết trong tam giác vuông, bình phương cạnh huyền bằng tổng bình phương hai cạnh góc vuông. Quan hệ này kết nối hình học với số học và có nhiều cách chứng minh khác nhau.",
            },
        ],
        sources: [
            {
                title: "Pythagoras — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/Pythagoras",
            },
            {
                title: "Định lý Pythagoras — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/%C4%90%E1%BB%8Bnh_l%C3%BD_Pythagoras",
            },
            {
                title: "Pythagoras — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/Biographies/Pythagoras/",
            },
            {
                title: "Pythagorean theorem — Encyclopaedia Britannica",
                url: "https://www.britannica.com/science/Pythagorean-theorem",
            },
        ],
    },
    {
        id: "archimedes",
        icon: "🧭",
        tag: "Khám phá",
        title: "Archimedes",
        desc: "Tìm hiểu các ý tưởng Toán học gắn với hình học và cơ học.",
        key: "archimedes",
        introduction:
            "Archimedes (khoảng 287–212 TCN), sinh tại Syracuse, là một trong những nhà toán học và kỹ sư nổi bật của thế giới Hy Lạp cổ đại. Các tác phẩm còn lại cho thấy ông nghiên cứu hình học bằng lập luận rất tinh tế.",
        sections: [
            {
                heading: "Đo diện tích và thể tích",
                text: "Archimedes tìm được các kết quả về diện tích hình tròn, mặt cầu và thể tích khối cầu. Ông thường dùng phương pháp vét cạn: so sánh hình cần đo với những hình đã biết để thu hẹp sai số.",
            },
            {
                heading: "Toán học và cơ học",
                text: "Trong các công trình về cân bằng và đòn bẩy, ông phân tích trọng tâm và quy luật cân bằng. Câu nói nổi tiếng về điểm tựa thường được gắn với Archimedes, nhưng nhiều phiên bản phổ biến là lời kể về sau.",
            },
            {
                heading: "Đọc sử liệu cẩn trọng",
                text: "Một số tác phẩm của Archimedes được biết qua bản chép và bản dịch còn lại. Những câu chuyện về phát minh hay chiến tranh nên được đối chiếu với nghiên cứu lịch sử thay vì chỉ dựa vào giai thoại.",
            },
        ],
        sources: [
            {
                title: "Archimedes — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/Archimedes",
            },
            {
                title: "Archimedes — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/Biographies/Archimedes/",
            },
            {
                title: "Archimedes — Encyclopaedia Britannica",
                url: "https://www.britannica.com/biography/Archimedes",
            },
        ],
    },
    {
        id: "numbers",
        icon: "🔢",
        tag: "Số học",
        title: "Lịch sử con số",
        desc: "Khám phá hành trình của các hệ thống số qua nhiều nền văn minh.",
        key: "con so so hoc",
        introduction:
            "Cách viết số ngày nay là kết quả của nhiều đóng góp lịch sử. Hệ chữ số 0–9 và cách ghi số theo vị trí giúp biểu diễn những số rất lớn bằng một bộ ký hiệu nhỏ.",
        sections: [
            {
                heading: "Giá trị theo vị trí",
                text: "Trong hệ thập phân theo vị trí, một chữ số có giá trị tùy vào hàng của nó. Số 0 vừa là một chữ số, vừa có thể giữ chỗ để phân biệt các hàng, chẳng hạn 205 với 25.",
            },
            {
                heading: "Con đường truyền bá",
                text: "Hệ chữ số phát triển ở Ấn Độ và được các học giả trong thế giới Hồi giáo tiếp nhận, phát triển rồi truyền sang châu Âu. Tên gọi “chữ số Ả Rập” phản ánh một chặng đường truyền bá, không phải nguồn gốc duy nhất của hệ thống.",
            },
            {
                heading: "Không chỉ có một hệ thống số",
                text: "Các nền văn minh từng dùng hệ thập phân, hệ hai mươi, hệ sáu mươi và nhiều cách ghi số khác. Mỗi hệ thống phản ánh nhu cầu tính toán, trao đổi và ghi chép của xã hội sử dụng nó.",
            },
        ],
        sources: [
            {
                title: "Chữ số Ả Rập — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/Ch%E1%BB%AF_s%E1%BB%91_%E1%BA%A2_R%E1%BA%ADp",
            },
            {
                title: "Lịch sử toán học — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/L%E1%BB%8Bch_s%E1%BB%AD_to%C3%A1n_h%E1%BB%8Dc",
            },
            {
                title: "Numeral systems and the history of zero — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/HistTopics/Indian_numerals/",
            },
            {
                title: "Hindu-Arabic numerals — Encyclopaedia Britannica",
                url: "https://www.britannica.com/science/Hindu-Arabic-numeral-system",
            },
        ],
    },
    {
        id: "al-khwarizmi",
        icon: "🧮",
        tag: "Đại số",
        title: "Al-Khwarizmi và sự ra đời của đại số",
        desc: "Tìm hiểu học giả ở Baghdad có công hệ thống hóa các phương pháp đại số.",
        key: "al khwarizmi dai so baghdad",
        introduction:
            "Muhammad ibn Musa al-Khwarizmi là học giả hoạt động tại Baghdad vào khoảng thế kỷ 9. Tác phẩm về phép tính al-jabr đã trình bày các phương pháp giải những bài toán thực tế và góp phần hình thành ngành đại số như một lĩnh vực toán học có hệ thống.",
        sections: [
            {
                heading: "Học thuật ở Baghdad",
                text: "Al-Khwarizmi làm việc dưới sự bảo trợ của caliph al-Ma'mun trong môi trường học thuật ở Baghdad. Ông nghiên cứu và viết về toán học, thiên văn học cùng các lĩnh vực liên quan. Tư liệu về cuộc đời ông còn hạn chế, vì vậy nhiều chi tiết tiểu sử vẫn chưa được xác định chắc chắn.",
            },
            {
                heading: "Tác phẩm về al-jabr",
                text: "Tác phẩm Hisab al-jabr w'al-muqabala hướng dẫn cách giải các phương trình bậc nhất và bậc hai bằng những phép biến đổi được trình bày theo lời văn. Tác phẩm cũng bàn đến các vấn đề thực tiễn như thừa kế, giao dịch và đo đạc. Từ al-jabr trong nhan đề là nguồn gốc của từ “đại số” trong nhiều ngôn ngữ.",
            },
            {
                heading: "Ảnh hưởng và cách nhìn lịch sử",
                text: "Các bản dịch Latin thời Trung cổ giúp truyền bá những phương pháp của ông tới châu Âu. Al-Khwarizmi không tạo ra toàn bộ kiến thức đại số từ con số không: ông tiếp thu và phát triển tri thức từ nhiều truyền thống toán học. Di sản của ông nằm ở việc hệ thống hóa và truyền đạt các phương pháp đó.",
            },
        ],
        sources: [
            {
                title: "Al-Khwarizmi — Wikipedia tiếng Việt",
                url: "https://vi.wikipedia.org/wiki/Al-Khwarizmi",
            },
            {
                title: "Al-Khwarizmi — MacTutor History of Mathematics",
                url: "https://mathshistory.st-andrews.ac.uk/Biographies/Al-Khwarizmi/",
            },
            {
                title: "Al-Khwarizmi — Encyclopaedia Britannica",
                url: "https://www.britannica.com/biography/al-Khwarizmi",
            },
            {
                title: "Algebra — Encyclopaedia Britannica",
                url: "https://www.britannica.com/science/algebra",
            },
        ],
    },
];

// Mỗi mốc gồm năm, tên sự kiện và lời giới thiệu ngắn.
export const timeline = [
    ["~3000 TCN", "Ai Cập", "Toán học gắn với đo đạc và đời sống."],
    ["~600 TCN", "Pythagoras", "Các tư tưởng quan trọng về số và hình học."],
    ["~300 TCN", "Euclid", "“Cơ sở” trở thành tác phẩm nền tảng của hình học."],
    ["~250 TCN", "Archimedes", "Đóng góp nổi bật trong hình học và cơ học."],
    [
        "Thế kỷ IX",
        "Al-Khwarizmi",
        "Hệ thống hóa các phương pháp đại số trong tác phẩm về al-jabr.",
    ],
];

// Đáp án chỉ dùng ở backend; API content chỉ trả câu hỏi và các lựa chọn.
export const quiz = {
    question:
        "Ai là tác giả của “Cơ sở” (Elements), tác phẩm có ảnh hưởng lớn đến hình học?",
    options: ["Pythagoras", "Euclid", "Archimedes", "Fibonacci"],
    answer: 1,
};
